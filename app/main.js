const { execSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const PATH = process.env.PATH;
let currentWorkingDir = process.cwd();

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

  let newPath = path.startsWith(".") ? currentWorkingDir : "";

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