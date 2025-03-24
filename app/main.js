const execSync = require("child_process").execSync;
const readline = require("readline");
const fs = require('node:fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer // Add a completer function
});

const PATH = process.env.PATH;
const splitCurrDir = __dirname.split("/");
let currWorkDir = `/${splitCurrDir[splitCurrDir.length - 1]}`;
let isFirstTabPress = true;

// Autocompletion function
function completer(line) {
  const commands = getCommandsInPath();
  const hits = commands.filter(c => c.startsWith(line));

  if (hits.length === 0) {
    // No matches, do nothing
    return [[], line];
  } else if (hits.length === 1) {
    // Single match, autocomplete and append a space
    isFirstTabPress = true; // Reset state
    return [[hits[0] + " "], line];
  } else {
    // Multiple matches
    if (isFirstTabPress) {
      // First tab press: ring the bell and do not autocomplete
      process.stdout.write('\x07'); // Ring the bell
      isFirstTabPress = false;
      return [[], line];
    } else {
      // Second tab press: find the longest common prefix
      const longestPrefix = findLongestCommonPrefix(hits);
      if (longestPrefix !== line) {
        // Autocomplete to the longest common prefix
        isFirstTabPress = true; // Reset state
        return [[longestPrefix], line];
      } else {
        // Display all completions on a single line
        process.stdout.write(hits.join("  ") + "\n"); // Print completions on a single line
        rl.prompt(true); // Re-display the prompt
        return [hits, line];
      }
    }
  }
}

// Find the longest common prefix among an array of strings
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

// Get all commands in PATH
function getCommandsInPath() {
  const paths = PATH.split(":");
  let commands = [];
  for (let path of paths) {
    if (!fs.existsSync(path)) continue;
    const fileNames = fs.readdirSync(path);
    commands = commands.concat(fileNames);
  }
  return commands;
}

function checkIfCommandExistsInPath(builtin) {
  const paths = PATH.split(":");
  for (let path of paths) {
    if (!fs.existsSync(path)) continue;
    const fileNames = fs.readdirSync(path);
    if (fileNames.includes(builtin)) {
      console.log(`${builtin} is ${path}/${builtin}`);
      return true;
    }
  }
  return false;
}

function handleEcho(text) {
  if (text.startsWith("'") && text.endsWith("'")) {
    const formattedString = text.slice(1, text.length - 1);
    console.log(formattedString.replaceAll("'", ""));
    return;
  }
  const formattedString = text.split(" ").filter(t => t !== "").join(" ");
  console.log(formattedString);
}

function handleChangeDirectory(answer) {
  let path = answer.split(" ")[1];
  if (path === "~") {
    currWorkDir = process.env.HOME;
    return;
  }
  let newWorkDir = "";
  if (!path.startsWith(".")) {
    path = path.slice(1);
  } else {
    newWorkDir = currWorkDir;
  }
  if (path.endsWith("/")) {
    path = path.slice(0, path.length - 1);
  }
  const steps = path.split("/");
  for (let step of steps) {
    switch (step) {
      case ".":
        break;
      case "..":
        const splitNewWorkDir = newWorkDir.split("/");
        newWorkDir = splitNewWorkDir.slice(0, splitNewWorkDir.length - 1).join("/");
        break;
      default:
        newWorkDir += `/${step}`;
    }
    if (!fs.existsSync(newWorkDir)) {
      console.log(`cd: ${answer.split(" ")[1]}: No such file or directory`);
      return;
    }
  }
  currWorkDir = newWorkDir;
}

function handledExternalProgram(answer) {
  const paths = PATH.split(":");
  let foundPath = "";
  const program = answer.split(" ")[0];
  for (let path of paths) {
    if (!fs.existsSync(path)) continue;
    const fileNames = fs.readdirSync(path);
    if (fileNames.includes(program)) {
      foundPath = path;
      break;
    }
  }
  if (foundPath !== "") {
    const output = execSync(answer);
    const outputString = output.toString();
    console.log(outputString.slice(0, output.length - 1))
    return true;
  }
  return false;
}

function handleAnswer(answer) {
  if (answer === "exit 0") {
    rl.close();
    return;
  }
  if (answer.startsWith("echo ")) {
    const text = answer.replace("echo ", "");
    handleEcho(text);
  } else if (answer.startsWith("type ")) {
    const builtin = answer.replace("type ", "");
    let found = false;
    switch (builtin) {
      case "echo":
      case "type":
      case "exit":
      case "pwd":
      case "cd":
        console.log(`${builtin} is a shell builtin`)
        found = true;
        break;
      default:
        found = checkIfCommandExistsInPath(builtin);
        break;
    }
    if (!found) {
      console.log(`${builtin}: not found`);
    }
  } else if (answer === "pwd") {
    console.log(currWorkDir);
  } else if (answer.startsWith("cd ")) {
    handleChangeDirectory(answer);
  } else if (!handledExternalProgram(answer)) {
    console.log(`${answer}: command not found`);
  }
  repeat();
}

function repeat() {
  rl.question("$ ", (answer) => {
    handleAnswer(answer);
  });
}

repeat();