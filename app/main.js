const { execSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer, // Add autocomplete functionality
});

const PATH = process.env.PATH;
let currentWorkingDir = process.cwd();
let tabPressCount = 0; // Track the number of times <TAB> is pressed

// ========================
// Autocomplete Functionality
// ========================

/**
 * Autocomplete function for readline.
 * @param {string} line - The current input line.
 * @returns {[string[], string]} - Array of matches and the current line.
 */
function completer(line) {
  const commands = getMatchingCommands(line);
  if (commands.length === 1) {
    // Single match: autocomplete and append a space
    tabPressCount = 0; // Reset tab press count
    return [[commands[0] + " "], line];
  } else if (commands.length > 1) {
    if (tabPressCount === 1) {
      // Double <TAB>: display all matches
      console.log(commands.join(" ")); // Print all matches
      process.stdout.write('\x07'); // Ring the bell
      tabPressCount = 0; // Reset tab press count
      return [[], line]; // Do not modify the command line
    } else {
      // Single <TAB>: autocomplete to the common prefix
      tabPressCount++; // Increment tab press count
      const commonPrefix = findCommonPrefix(commands);
      if (commonPrefix.length > line.length) {
        return [[commonPrefix], line]; // Autocomplete to the common prefix
      } else {
        return [commands, line]; // Return all matches
      }
    }
  }
  return [[], line]; // No matches
}

/**
 * Find the longest common prefix among an array of strings.
 * @param {string[]} strings - Array of strings.
 * @returns {string} - The longest common prefix.
 */
function findCommonPrefix(strings) {
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

/**
 * Get all commands in PATH that match the partial command.
 * @param {string} partialCommand - The partial command to match.
 * @returns {string[]} - Array of matching commands.
 */
function getMatchingCommands(partialCommand) {
  const paths = PATH.split(":");
  const matches = new Set();

  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const files = fs.readdirSync(path);
    for (const file of files) {
      if (file.startsWith(partialCommand)) {
        matches.add(file);
      }
    }
  }

  return Array.from(matches);
}

// ========================
// Command Handlers
// ========================

/**
 * Handle the 'echo' command.
 * @param {string} text - The text to echo.
 */
function handleEcho(text) {
  const formattedText = text.startsWith("'") && text.endsWith("'")
    ? text.slice(1, -1).replaceAll("'", "")
    : text.split(" ").filter(t => t !== "").join(" ");
  console.log(formattedText);
}

/**
 * Handle the 'cd' command.
 * @param {string} path - The directory path to change to.
 */
function handleChangeDirectory(path) {
  if (path === "~") {
    currentWorkingDir = process.env.HOME;
    return;
  }

  const newPath = path.startsWith("/") ? path : `${currentWorkingDir}/${path}`;
  const resolvedPath = resolvePath(newPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(`cd: ${path}: No such file or directory`);
    return;
  }

  currentWorkingDir = resolvedPath;
}

/**
 * Resolve a path by handling `.`, `..`, and empty segments.
 * @param {string} path - The path to resolve.
 * @returns {string} - The resolved path.
 */
function resolvePath(path) {
  const steps = path.split("/");
  const resolvedPath = [];

  for (const step of steps) {
    if (step === "..") {
      resolvedPath.pop();
    } else if (step !== "." && step !== "") {
      resolvedPath.push(step);
    }
  }

  return resolvedPath.join("/");
}

/**
 * Handle external programs.
 * @param {string} command - The command to execute.
 * @returns {boolean} - True if the command was executed, false otherwise.
 */
function handleExternalProgram(command) {
  const program = command.split(" ")[0];
  const paths = PATH.split(":");

  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const files = fs.readdirSync(path);
    if (files.includes(program)) {
      const output = execSync(command).toString().trim();
      console.log(output);
      return true;
    }
  }
  return false;
}

/**
 * Check if a command exists in PATH.
 * @param {string} command - The command to check.
 * @returns {boolean} - True if the command exists, false otherwise.
 */
function checkIfCommandExistsInPath(command) {
  const paths = PATH.split(":");
  for (const path of paths) {
    if (!fs.existsSync(path)) continue;
    const files = fs.readdirSync(path);
    if (files.includes(command)) {
      console.log(`${command} is ${path}/${command}`);
      return true;
    }
  }
  return false;
}

// ========================
// Shell Core Functionality
// ========================

/**
 * Handle user input.
 * @param {string} answer - The user's input.
 */
function handleAnswer(answer) {
  if (answer === "exit 0") {
    rl.close();
    return;
  }

  const [command, ...args] = answer.split(" ");
  const builtins = ["echo", "type", "exit", "pwd", "cd"];

  switch (command) {
    case "echo":
      handleEcho(args.join(" "));
      break;
    case "type":
      const target = args[0];
      if (builtins.includes(target)) {
        console.log(`${target} is a shell builtin`);
      } else if (!checkIfCommandExistsInPath(target)) {
        console.log(`${target}: not found`);
      }
      break;
    case "pwd":
      console.log(currentWorkingDir);
      break;
    case "cd":
      handleChangeDirectory(args[0]);
      break;
    default:
      if (!handleExternalProgram(answer)) {
        console.log(`${answer}: command not found`);
      }
  }

  repeat();
}

/**
 * Repeat the prompt.
 */
function repeat() {
  rl.question("$ ", handleAnswer);
}

// Start the shell
repeat();