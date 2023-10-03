#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const OpenAI = require('openai');
const path = require('path');
const crypto = require('crypto');

const port = +process.env.PORT || 1179;

const openai = new OpenAI({

});
console.log('OpenAI instance created');

// Get the path of the input bash script from a command line argument
const inputScriptPath = process.argv[2];
console.log(`Input script path: ${inputScriptPath}`);

if (!inputScriptPath) {
    console.error('Please provide the path of the input Bash script as a command line argument.');
    process.exit(1);
}

// Read the input bash script
const inputScript = fs.readFileSync(inputScriptPath, 'utf8');
console.log('Input script read from file');

// Generate the getDebugInformation function
let debugInfo = new Promise(async (resolve, reject) => {
    console.log(`Generating debug information...  Navigate to http://localhost:${port} once this is finished to see the debug output`);

    const prompt = `
        I am going to give you the text of a script.

        Please reply with an completely executable bash script that the user of the provided script can use to debug the changes the script can make.
        The script must be ready to execute as-is without any modification or command line parameters.  
          
        Use your knowledge of each command in the input script to figure out what changes to the computer's state it would make, and what things you could execute in a bash command which would output text that would help someone debug the changes the script would make.
        For example, if a script starts docker containers you should deduce that the output of \`docker ps\` would be helpful.
        For exampke, if the script relied on letsencrypt ssl certificates, you should deduce that the debugger of that script would want to know if those certificates exist and if they're valid
        For example, if the script modified an nginx configuration you should deduce that the script runner would want to know the output of \`nginx -t\`, etc.
        For example, if the script was hosting webservers at a specific domain, you would want to display the status code of running GET / 
        Refrain from outputting really general information like "every port being listened to", or "all processes", and perhaps instead use awk/sed to figure out which ports to check for, based on values in config files

        The debug script you return with should have any and all information related to the state changes the input script makes.  It should be biased towards providing too much information, rather than too little.
        The script itself will output plain command line text.  

        Make sure your responses are formatted with the correct amount of escaping so I can parse your function calls.
        Make sure your responses are syntactically valid bash, don't forget to close your if blocks and loop blocks.

        Here is the input script.
        ${inputScript}"
        ` ;

    // If no debug script exists, query OpenAI
    const command = await getChatCompletion(prompt);
    // const confirmedCommand = confirmedCompletion.choices[0]?.message?.content;
    console.log(`Command from OpenAI: 
    ${command}
    `);
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            reject(error);
        } else {
            resolve(stdout);
        }
    });
});

async function getChatCompletion(prompt) {
    const getReturnValueFromCompletion = (completion) => {
        const { code } = JSON.parse(completion.choices[0].message.function_call.arguments);
        return code;
    }
    // Create a hash of the input script to use as a unique identifier
    const hash = crypto.createHash('sha256');
    hash.update(prompt);
    const scriptHash = hash.digest('hex');

    const cacheFilePath = path.join(__dirname, 'cache.json');
    let cache = {};
    if (fs.existsSync(cacheFilePath)) {
        cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    }
    if (cache[scriptHash]) {
        console.log('Debug script found in cache');
        return getReturnValueFromCompletion(cache[scriptHash]);
    } else {
        const completion = await openai.chat.completions.create({
            messages: [{
                role: 'user', content: prompt
            }],
            model: 'gpt-4',
            functions: [{
                name: 'executeBash',
                description: 'Executes a bash script that when called will give debug information about the input script',
                parameters:  {
                    type: 'object',
                    properties: {
                        code: {
                            type: "string",
                            description: "The contents of bash script which will give debug information about the changes made by the input script"
                        }
                    }
                } ,
            }],
        });
        // Save the debug script for future use in JSON cache
        cache[scriptHash] = completion;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cache));
        console.log('Script analytsis response saved to cache');
        return getReturnValueFromCompletion(completion);
    }
}

// Create a route to respond to GET requests with the output of the getDebugInformation function
app.get('/', async (req, res) => {
    console.log('GET request received');
    try {
        const debugInfoResult = await debugInfo;
        console.log('Debug information generated');
        res.send(`
        <pre>
        ${debugInfoResult}
        </pre>
        `);
    } catch (error) {
        console.error(`Error generating debug information: ${error}`);
        res.status(500).send(`Error generating debug information: ${error}`);
    }
});

// Start the web server
app.listen(port, () => console.log(`Server is listening on http://localhost:${port}`));