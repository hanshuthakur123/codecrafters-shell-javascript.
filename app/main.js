const readline = require("readline");
const fs = require("fs");
const { execSync } = require("child_process");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer // Add autocompletion support
});

const validCommands = ['echo', 'exit', 'type', 'pwd', 'cd'];

const isExitCommand = (command) => {
    return command === 'exit 0';
};

const isEchoCommand = (command) => {
    return command.startsWith('echo ');
};

const isTypeCommand = (command) => {
    return command.startsWith('type ');
};

const isPwdCommand = (command) => {
    return command === 'pwd';
};

const isCdCommand = (command) => {
    return command.startsWith("cd ");
};

function extractArgs(command) {
    const commandName = command.split(" ")[0];
    const args = command.slice(commandName.length + 1);
    let quoteIndex = 0;
    let charValue = '';
    let quoteChar = '';
    const elements = [];
    for (const value of args) {
        if (!quoteChar && (value === `'` || value === `"`)) {
            quoteChar = value;
        }
        if (quoteChar && quoteIndex % 2 === 0) {
            quoteIndex++;
            quoteChar = value;
        } else if (value === quoteChar && quoteIndex % 2 !== 0) {
            quoteIndex++;
            quoteChar = '';
        } else if (value === ' ' && quoteIndex % 2 === 0) {
            elements.push(charValue);
            charValue = '';
        } else {
            charValue += value;
        }
    }
    elements.push(charValue);
    return { commandName, args: elements.filter((o) => o) };
}

const isValidExec = (command) => {
    const paths = process.env.PATH ? process.env.PATH.split(':') : [];
    let filePath = '';
    paths.some((path) => {
        const fileName = `${path}/${command}`;
        return fs.existsSync(fileName) ? (filePath = fileName) : false;
    });
    return filePath;
};

const handleExecutables = (command) => {
    const { commandName } = extractArgs(command);
    const filePath = isValidExec(commandName);
    if (filePath) {
        const output = execSync(command);
        process.stdout.write(output);
    } else {
        console.log(`${command}: command not found`);
    }
};

const handleTypeCommand = (command) => {
    const { args } = extractArgs(command);
    const commandName = args[0];
    if (validCommands.includes(commandName)) {
        return console.log(`${commandName} is a shell builtin`);
    }
    const filePath = isValidExec(commandName);
    if (!filePath) {
        console.log(`${commandName}: not found`);
    } else {
        console.log(`${commandName} is ${filePath}`);
    }
};

const handleCdCommand = (command) => {
    const { commandName, args } = extractArgs(command);
    const path = args[0];
    try {
        if (path.includes("~")) {
            process.chdir(path.replace("~", process.env.HOME || ''));
        } else {
            process.chdir(path);
        }
    } catch (error) {
        console.log(`${commandName}: ${args}: No such file or directory`);
    }
};

const handleEchoCommand = (command) => {
    const { args } = extractArgs(command);
    console.log(args.join(" "));
};

const handleCommands = (command) => {
    if (isEchoCommand(command)) {
        handleEchoCommand(command);
    } else if (isExitCommand(command)) {
        rl.close();
        return true;
    } else if (isTypeCommand(command)) {
        handleTypeCommand(command);
    } else if (isPwdCommand(command)) {
        console.log(process.cwd());
    } else if (isCdCommand(command)) {
        handleCdCommand(command);
    } else {
        handleExecutables(command);
    }
    return false;
};

// Autocompletion function for Stage #TG6
function completer(line) {
    const input = line.trim();
    const commands = [...validCommands, ...getExternalCommands()];
    const hits = commands.filter((c) => c.startsWith(input)).sort();

    if (hits.length === 0) {
        return [[], line]; // No matches
    }

    if (hits.length === 1) {
        return [[hits[0] + " "], line]; // Single match, add space
    }

    // Multiple matches: find common prefix and list all if no further completion
    const commonPrefix = findCommonPrefix(hits);
    if (commonPrefix && commonPrefix.length > input.length) {
        return [[commonPrefix], line]; // Complete to common prefix
    }

    // Display all matches if TAB pressed and no unique completion
    console.log("\n" + hits.join("  "));
    rl.write(null, { ctrl: true, name: 'u' }); // Clear current line
    rl.write(line); // Restore original input
    return [hits, line];
}

// Helper to get external commands from PATH
function getExternalCommands() {
    const paths = process.env.PATH ? process.env.PATH.split(':') : [];
    const commands = new Set();
    for (let p of paths) {
        if (fs.existsSync(p)) {
            const files = fs.readdirSync(p);
            files.forEach((file) => {
                const fullPath = `${p}/${file}`;
                if (fs.statSync(fullPath).isFile()) {
                    commands.add(file);
                }
            });
        }
    }
    return Array.from(commands);
}

// Helper to find common prefix among matches
function findCommonPrefix(strings) {
    if (strings.length === 0) return "";
    if (strings.length === 1) return strings[0];
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        let j = 0;
        while (j < prefix.length && j < strings[i].length && prefix[j] === strings[i][j]) {
            j++;
        }
        prefix = prefix.substring(0, j);
        if (prefix === "") break;
    }
    return prefix;
}

const askQuestion = () => {
    rl.question("$ ", (command) => {
        if (handleCommands(command)) {
            return;
        } else {
            askQuestion();
        }
    });
};

askQuestion();