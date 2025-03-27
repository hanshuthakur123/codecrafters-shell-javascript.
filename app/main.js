const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const os = require("os");

const CMDS = ["type", "echo", "exit", "pwd", "cd"]; // Built-in commands

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
  completer: completer // Add completer function for autocompletion
});

rl.prompt();

rl.on("line", (input) => {
  input = input.trim();
  execCmd(input, () => {
    rl.prompt();
  });
});

// Autocompletion function
function completer(line) {
  const input = line.trim();
  const allCommands = [...CMDS, ...getExternalCommands()];
  const hits = allCommands.filter((c) => c.startsWith(input)).sort();

  if (hits.length === 0) {
    return [[], line]; // No matches
  }

  if (hits.length === 1) {
    return [[hits[0] + " "], line]; // Single match, add space
  }

  // Multiple matches, find common prefix
  const commonPrefix = findCommonPrefix(hits);
  if (commonPrefix && commonPrefix.length > input.length) {
    return [[commonPrefix], line]; // Partial completion to common prefix
  }

  // If no further completion possible, return all matches
  return [hits, line];
}

// Find common prefix among an array of strings
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

// Get all executable commands from PATH
function getExternalCommands() {
  const paths = process.env.PATH.split(path.delimiter);
  const commands = new Set();
  for (let p of paths) {
    if (fs.existsSync(p)) {
      const files = fs.readdirSync(p);
      files.forEach((file) => {
        const fullPath = path.join(p, file);
        if (fs.statSync(fullPath).isFile()) {
          commands.add(file);
        }
      });
    }
  }
  return Array.from(commands);
}

function execCmd(command, callback) {
  const { cmd, args } = getCmd(command);
  if (cmd === "exit" && args[0] === "0") {
    process.exit(0);
  } else if (cmd === "echo") {
    console.log(args.join(" "));
    callback();
  } else if (cmd === "type") {
    printType(args[0]);
    callback();
  } else if (cmd === "pwd") {
    console.log(process.cwd());
    callback();
  } else if (cmd === "cd") {
    let targetPath;
    if (args.length === 0 || args[0] === "~") {
      targetPath = os.homedir();
    } else {
      targetPath = path.resolve(args[0]);
    }
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      process.chdir(targetPath);
    } else {
      console.log(`cd: ${args[0]}: No such file or directory`);
    }
    callback();
  } else {
    const paths = process.env.PATH.split(path.delimiter);
    let found = false;
    for (let p of paths) {
      const fullPath = path.join(p, cmd);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        found = true;
        execFileSync(cmd, args, { stdio: "inherit" });
        callback();
        break;
      }
    }
    if (!found) {
      console.log(`${command}: command not found`);
      callback();
    }
  }
}

function getCmd(answer) {
  let args = [];
  let currentArg = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  for (let i = 0; i < answer.length; i++) {
    const char = answer[i];
    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === " " && !inSingleQuotes && !inDoubleQuotes) {
      if (currentArg.length > 0) {
        args.push(currentArg);
        currentArg = "";
      }
    } else {
      currentArg += char;
    }
  }
  if (currentArg.length > 0) {
    args.push(currentArg);
  }
  let cmd = args[0] || "";
  args.shift();
  return { cmd, args };
}

function printType(cmdName) {
  let found = false;
  if (CMDS.includes(cmdName)) {
    console.log(`${cmdName} is a shell builtin`);
    found = true;
  } else {
    const paths = process.env.PATH.split(path.delimiter);
    for (let p of paths) {
      const fullPath = path.join(p, cmdName);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        console.log(`${cmdName} is ${fullPath}`);
        found = true;
        break;
      }
    }
  }
  if (!found) {
    console.log(`${cmdName}: not found`);
  }
}

// Remove duplicate functions (findType, handleExternalCommand, changeDirectory, parseInput, prompt)
// since they are redundant with execCmd and getCmd