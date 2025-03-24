const execSync = require("child_process").execSync;
const readline = require("readline");
const fs = require("node:fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer, // Add a completer function
});

const PATH = process.env.PATH.split(path.delimiter);
let currWorkDir = process.cwd();
let isFirstTabPress = true;

// Autocompletion function
function completer(line) {
  const commands = getCommandsInPath();
  const hits = commands.filter((c) => c.startsWith(line));

  if (hits.length === 0) {
    process.stdout.write("\x07"); // Ring the bell
    return [[], line]; // No completions
  }

  if (hits.length === 1) {
    // If there's only one match, append a space to the completed command
    return [[hits[0] + " "], line];
  }

  if (isFirstTabPress) {
    // First tab press: ring the bell and do not autocomplete
    process.stdout.write("\x07"); // Ring the bell
    isFirstTabPress = false;
    return [[], line]; // Return no completions
  } else {
    // Second tab press: list all completions in a single line
    isFirstTabPress = true; // Reset state
    const completions = hits.join(" "); // Join completions with spaces
    return [[completions], line];
  }
}

// Get all commands in PATH
function getCommandsInPath() {
  let commands = [];
  for (let dir of PATH) {
    if (!fs.existsSync(dir)) continue;
    const fileNames = fs.readdirSync(dir);
    commands = commands.concat(fileNames);
  }
  return commands;
}

// Handle echo command
function handleEcho(text) {
  if (text.startsWith("'") && text.endsWith("'")) {
    const formattedString = text.slice(1, text.length - 1);
    console.log(formattedString.replaceAll("'", ""));
    return;
  }
  const formattedString = text.split(" ").filter((t) => t !== "").join(" ");
  console.log(formattedString);
}

// Handle type command
function handleType(builtin) {
  let found = false;
  switch (builtin) {
    case "echo":
    case "type":
    case "exit":
    case "pwd":
    case "cd":
      console.log(`${builtin} is a shell builtin`);
      found = true;
      break;
    default:
      found = checkIfCommandExistsInPath(builtin);
      break;
  }
  if (!found) {
    console.log(`${builtin}: not found`);
  }
}

// Check if a command exists in PATH
function checkIfCommandExistsInPath(builtin) {
  for (let dir of PATH) {
    if (!fs.existsSync(dir)) continue;
    const fileNames = fs.readdirSync(dir);
    if (fileNames.includes(builtin)) {
      console.log(`${builtin} is ${path.join(dir, builtin)}`);
      return true;
    }
  }
  return false;
}

// Handle cd command
function handleChangeDirectory(answer) {
  let targetPath = answer.split(" ")[1];
  if (targetPath === "~") {
    currWorkDir = process.env.HOME;
    return;
  }
  let newWorkDir = path.resolve(currWorkDir, targetPath);
  if (!fs.existsSync(newWorkDir)) {
    console.log(`cd: ${targetPath}: No such file or directory`);
    return;
  }
  currWorkDir = newWorkDir;
}

// Handle external programs
function handledExternalProgram(answer) {
  const program = answer.split(" ")[0];
  for (let dir of PATH) {
    if (!fs.existsSync(dir)) continue;
    const fileNames = fs.readdirSync(dir);
    if (fileNames.includes(program)) {
      try {
        const output = execSync(answer);
        const outputString = output.toString();
        console.log(outputString.slice(0, output.length - 1));
        return true;
      } catch (error) {
        console.error(`Error executing command: ${error.message}`);
        return false;
      }
    }
  }
  return false;
}

// Handle user input
function handleAnswer(answer) {
  const tokens = answer.split(" ").filter((token) => token !== "");
  const command = tokens[0];
  const args = tokens.slice(1);

  switch (command) {
    case "echo":
      handleEcho(args.join(" "));
      break;
    case "type":
      handleType(args[0]);
      break;
    case "exit":
      rl.close();
      break;
    case "pwd":
      console.log(currWorkDir);
      break;
    case "cd":
      handleChangeDirectory(answer);
      break;
    default:
      if (!handledExternalProgram(answer)) {
        console.log(`${command}: command not found`);
      }
      break;
  }
  repeat();
}

// Reset state and prompt for next input
function repeat() {
  isFirstTabPress = true; // Reset state for new input
  rl.question("$ ", (answer) => {
    handleAnswer(answer);
  });
}

// Start the program
repeat();