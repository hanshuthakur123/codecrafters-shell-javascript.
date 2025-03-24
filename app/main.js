const execSync = require("child_process").execSync;
const readline = require("readline");
const fs = require("node:fs");

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer, // Add a completer function
});

// Global state
let currentWorkingDirectory = getCurrentWorkingDirectory();
let isFirstTabPress = true;

// Main function to start the shell
function startShell() {
  console.log("Simple Shell. Type 'exit 0' to quit.");
  promptUser();
}

// Function to prompt the user for input
function promptUser() {
  rl.question("$ ", (answer) => {
    handleCommand(answer);
  });
}

// Function to handle user commands
function handleCommand(command) {
  if (command === "exit 0") {
    rl.close();
    return;
  }

  if (command.startsWith("echo ")) {
    handleEcho(command);
  } else if (command.startsWith("type ")) {
    handleType(command);
  } else if (command === "pwd") {
    handlePwd();
  } else if (command.startsWith("cd ")) {
    handleChangeDirectory(command);
  } else {
    handleExternalProgram(command);
  }

  promptUser(); // Continue prompting for the next command
}

// Function to handle the 'echo' command
function handleEcho(command) {
  const text = command.replace("echo ", "").trim();
  if (text.startsWith("'") && text.endsWith("'")) {
    console.log(text.slice(1, -1).replaceAll("'", ""));
  } else {
    console.log(text.split(" ").filter((t) => t !== "").join(" "));
  }
}

// Function to handle the 'type' command
function handleType(command) {
  const program = command.replace("type ", "").trim();
  const builtins = ["echo", "type", "exit", "pwd", "cd"];

  if (builtins.includes(program)) {
    console.log(`${program} is a shell builtin`);
  } else if (checkIfCommandExistsInPath(program)) {
    console.log(`${program} is ${getCommandPath(program)}`);
  } else {
    console.log(`${program}: not found`);
  }
}

// Function to handle the 'pwd' command
function handlePwd() {
  console.log(currentWorkingDirectory);
}

// Function to handle the 'cd' command
function handleChangeDirectory(command) {
  const path = command.split(" ")[1];
  if (path === "~") {
    currentWorkingDirectory = process.env.HOME;
    return;
  }

  let newPath = resolvePath(path, currentWorkingDirectory);
  if (!fs.existsSync(newPath)) {
    console.log(`cd: ${path}: No such file or directory`);
    return;
  }

  currentWorkingDirectory = newPath;
}

// Function to resolve a relative or absolute path
function resolvePath(path, baseDir) {
  if (path.startsWith("/")) {
    return path;
  }
  return `${baseDir}/${path}`;
}

// Function to handle external programs
function handleExternalProgram(command) {
  const program = command.split(" ")[0];
  const programPath = getCommandPath(program);

  if (programPath) {
    try {
      const output = execSync(command);
      console.log(output.toString().trim());
    } catch (error) {
      console.log(`${program}: execution failed`);
    }
  } else {
    console.log(`${program}: command not found`);
  }
}

// Function to check if a command exists in PATH
function checkIfCommandExistsInPath(program) {
  return !!getCommandPath(program);
}

// Function to get the full path of a command
function getCommandPath(program) {
  const paths = process.env.PATH.split(":");
  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const fileNames = fs.readdirSync(path);
    if (fileNames.includes(program)) {
      return `${path}/${program}`;
    }
  }
  return null;
}

// Function to get the current working directory
function getCurrentWorkingDirectory() {
  const dirParts = __dirname.split("/");
  return `/${dirParts[dirParts.length - 1]}`;
}

// Autocompletion function
function completer(line) {
  const commands = getCommandsInPath();
  const matches = commands.filter((cmd) => cmd.startsWith(line));

  if (matches.length === 0) {
    return [[], line];
  } else if (matches.length === 1) {
    isFirstTabPress = true;
    return [[matches[0] + " "], line];
  } else {
    if (isFirstTabPress) {
      process.stdout.write("\x07"); // Ring the bell
      isFirstTabPress = false;
      return [[], line];
    } else {
      const longestPrefix = findLongestCommonPrefix(matches);
      if (longestPrefix !== line) {
        isFirstTabPress = true;
        return [[longestPrefix], line];
      } else {
        process.stdout.write(matches.join("  ") + "\n");
        rl.prompt(true);
        return [[], line];
      }
    }
  }
}

// Function to find the longest common prefix among strings
function findLongestCommonPrefix(strings) {
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

// Function to get all commands in PATH
function getCommandsInPath() {
  const paths = process.env.PATH.split(":");
  let commands = [];
  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const fileNames = fs.readdirSync(path);
    commands = commands.concat(fileNames);
  }
  return commands;
}

// Start the shell
startShell();