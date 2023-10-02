const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const openai = require('openai');

const openai = new OpenAI({

});


// Get the path of the input bash script from a command line argument
const inputScriptPath = process.argv[2];

if (!inputScriptPath) {
    console.error('Please provide the path of the input Bash script as a command line argument.');
    process.exit(1);
}

// Read the input bash script
const inputScript = fs.readFileSync(inputScriptPath, 'utf8');

// Define the path of the JSON file to store the results
const resultsFilePath = './results.json';

// Generate the getDebugInformation function
let debugInfo = new Promise(async (resolve, reject) => {
    const completion = await openai.chat.completions.create({
        messages: [{
            role: 'user', content: `
        I am going to give you the text of a script.
        Please reply with an executable bash script that the user of the provided script can use to debug the changes the script can make.
        
        Use your knowledge of each command in the input script to figure out what changes to the computer's state it would make, and what things you could execute in a bash command which would output text that would help someone debug the changes the script would make.
        For example, if a script starts docker containers you should deduce that the output of \`docker ps\` would be helpful.
        If the script relied on letsencrypt ssl certificates, you should deduce that the debugger of that script would want to know if those certificates exist and if they're valid
        If the script modified an nginx configuration you should deduce that the script runner would want to know the output of \`nginx -t\`, etc.

        The debug script you return with should have any and all information related to the state changes the input script makes.  It should be biased towards providing too much information, rather than too little.
        The script itself will output plain command line text.

        Here is the input script.
        ${inputScript}"
        ` }],
        model: 'gpt-4',
    });

    const command = completion.choices[0]?.message?.content;
    console.log(command);
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            reject(error);
        } else {
            fs.writeFileSync(resultsFilePath, JSON.stringify({ stdout }));
            resolve(stdout);
        }
    });
});

// Create a route to respond to GET requests with the output of the getDebugInformation function
app.get('/', async (req, res) => {
    try {
        const debugInfoResult = await debugInfo;
        res.send(debugInfoResult);
    } catch (error) {
        res.status(500).send(`Error generating debug information: ${error}`);
    }
});

// Start the web server
app.listen(1179, () => console.log('Server is listening on port 1179'));