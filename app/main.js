const { execSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer, // Add autocomplete functionality
});

const PATH = process.env.PATH;
let currentWorkingDir = process.cwd();
let tabPressCount = 0; // Track the number of times <TAB> is pressed

// Autocomplete function
function completer(line) {
    const commands = getMatchingCommands(line);
    if (commands.length === 1) {
      // If there's only one match, append a space after the autocompleted command
      tabPressCount = 0; // Reset tab press count
      return [[commands[0] + " "], line];
    } else if (commands.length > 1) {
      if (tabPressCount === 1) {
        // If <TAB> is pressed twice, display all matches
        console.log(commands.join(" ")); // Print all matches
        process.stdout.write('\x07'); // Ring the bell
        tabPressCount = 0; // Reset tab press count
        return [[], line]; // Do not modify the command line
      } else {
        // On the first <TAB> press, autocomplete to the common prefix
        const commonPrefix = findCommonPrefix(commands);
        if (commonPrefix && commonPrefix !== line) {
          tabPressCount++; // Increment tab press count
          return [[commonPrefix], commonPrefix]; // Autocomplete to the common prefix
        } else {
          tabPressCount++; // Increment tab press count
          return [commands, line]; // Return all matches
        }
      }
    }
    return [[], line]; // No matches
  }
// Utility function to check if a command exists in PATH
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

// Handle 'echo' command
function handleEcho(text) {
  const formattedText = text.startsWith("'") && text.endsWith("'")
    ? text.slice(1, -1).replaceAll("'", "")
    : text.split(" ").filter(t => t !== "").join(" ");
  console.log(formattedText);
}

// Handle 'cd' command
function handleChangeDirectory(path) {
  if (path === "~") {
    currentWorkingDir = process.env.HOME;
    return;
  }

  let newPath = path.startsWith("/") ? "" : currentWorkingDir;

  const steps = path.replace(/\/$/, "").split("/");
  for (const step of steps) {
    if (step === "..") {
      newPath = newPath.split("/").slice(0, -1).join("/");
    } else if (step !== ".") {
      newPath += `/${step}`;
    }

    if (!fs.existsSync(newPath)) {
      console.log(`cd: ${path}: No such file or directory`);
      return;
    }
  }

  currentWorkingDir = newPath;
}

// Handle external programs
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
// Handle user input
function handleAnswer(answer) {
  if (answer === "exit 0") {
    rl.close();
    return;
  }

  const [command, ...args] = answer.split(" ");

  switch (command) {
    case "echo":
      handleEcho(args.join(" "));
      break;
    case "type":
      const target = args[0];
      const builtins = ["echo", "type", "exit", "pwd", "cd"];
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

// Repeat the prompt
function repeat() {
  rl.question("$ ", handleAnswer);
}

// Start the shell
repeat();