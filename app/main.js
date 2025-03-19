const readline = require("readline");
const path = require("path");
const fs = require("fs");
const { execSync } = require('child_process');

// Constants
const CMDS = ["type", "echo", "exit", "pwd", "cd"];

// Readline Interface with Autocompletion
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer, // Add the completer function
});

// Prepare the shell prompt
function prepareShell() {
  process.stdout.write("$ ");
}

// Execute a command
function executeCommand(command) {
  const { cmd, args } = getCmd(command);

  if (command === "exit 0") {
    process.exit(0);
  }

  let res = `${command}: command not found`;
  if (cmd === "echo") {
    res = getEchoCmd(args, command);
  } else if (cmd === "type") {
    res = getTypeCmd(args[0]);
  } else if (cmd === "pwd") {
    res = process.cwd();
  } else if (cmd === "cd") {
    res = execCd(args);
    if (res === undefined) {
      return;
    }
  } else {
    res = execExternalProgram(cmd, command);
  }

  console.log(res);
}

// Extract command and arguments
function getCmd(answer) {
  let args = answer.split(/\s+/);
  let cmd = args[0];
  args.shift();
  return { cmd, args };
}

// Handle echo command
function getEchoCmd(args, command) {
  let part = command.split("'");
  let n = part.length;
  if (n >= 3 && part[0].trim() === "echo" && part[n - 1].trim() === "") {
    return part.slice(1, n - 1).join("");
  }
  return args.join(" ");
}

// Get the full path of a command
function getCmdFullPath(cmd) {
  const paths = process.env.PATH.split(path.delimiter);
  for (let p of paths) {
    const fullPath = path.join(p, cmd);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return `${fullPath}`;
    }
  }
  return "";
}

// Handle type command
function getTypeCmd(cmdName) {
  const cmdFullPath = getCmdFullPath(cmdName);
  if (CMDS.includes(cmdName)) {
    return `${cmdName} is a shell builtin`;
  } else if (cmdFullPath !== "") {
    return `${cmdName} is ${cmdFullPath}`;
  }
  return `${cmdName}: not found`;
}

// Execute an external program
function execExternalProgram(cmd, command) {
  const cmdFullPath = getCmdFullPath(cmd);
  if (cmdFullPath === "") {
    return `${command}: command not found`;
  }
  return execSync(command).toString().trim();
}

// Handle cd command
function execCd(args) {
  const path = args[0];
  if (path === "~") {
    process.chdir(process.env.HOME);
  } else if (args.length > 1 || !fs.existsSync(path)) {
    return `cd: ${path}: No such file or directory`;
  } else {
    process.chdir(path);
  }
}

// Autocompleter function
function completer(line) {
  const paths = process.env.PATH.split(path.delimiter);
  const executables = new Set();

  // Collect all executable files from PATH directories
  for (const dir of paths) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          fs.accessSync(fullPath, fs.constants.X_OK);
          const stats = fs.statSync(fullPath);
          if (stats.isFile()) {
            executables.add(file);
          }
        } catch (e) {
          // Skip non-executable files
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }

  // Combine built-in commands and executables
  const allCommands = [...CMDS, ...executables].sort();
  const currentInput = line.trim();
  const hits = allCommands.filter((cmd) => cmd.startsWith(currentInput)).sort();

  if (hits.length === 0) {
    return [[], line]; // No matches
  }

  const lcp = longestCommonPrefix(hits);
  if (lcp.length > currentInput.length) {
    // If there is a unique match, append a space
    if (hits.length === 1) {
      return [[hits[0] + " "], line];
    } else {
      return [[lcp], line]; // Complete to the longest common prefix
    }
  } else {
    return [hits, line]; // Return all matches
  }
}

// Helper function to find the longest common prefix
function longestCommonPrefix(strings) {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  return prefix;
}

// Main event listener for input
rl.on("line", (answer) => {
  answer = answer.trim();
  executeCommand(answer);
  prepareShell();
});

// Start the shell
prepareShell();