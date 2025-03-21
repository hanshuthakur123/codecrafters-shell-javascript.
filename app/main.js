const { exec } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Get system PATH
const PATH = process.env.PATH;
const pathSeparator = os.platform() === "win32" ? ";" : ":";
const homeDir = os.homedir();
let currWorkDir = process.cwd();

// Helper function to check if a command exists in PATH
async function checkIfCommandExistsInPath(command) {
  const paths = PATH.split(pathSeparator);
  for (const dir of paths) {
    try {
      const files = await fs.promises.readdir(dir);
      if (files.includes(command)) {
        return path.join(dir, command);
      }
    } catch (err) {
      // Ignore errors (e.g., directory not accessible)
    }
  }
  return null;
}

// Handle echo command
function handleEcho(text) {
  if (text.startsWith("'") && text.endsWith("'") || text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  console.log(text);
}

// Handle cd command
function handleChangeDirectory(targetDir) {
  if (targetDir === "~") {
    currWorkDir = homeDir;
    return;
  }

  const newDir = path.resolve(currWorkDir, targetDir);
  if (!fs.existsSync(newDir)) {
    console.log(`cd: ${targetDir}: No such file or directory`);
    return;
  }
  currWorkDir = newDir;
}

// Handle external programs
function handleExternalProgram(command, args) {
  return new Promise((resolve, reject) => {
    const child = exec(`${command} ${args.join(" ")}`, { cwd: currWorkDir }, (error, stdout, stderr) => {
      if (error) {
        reject(error.message);
        return;
      }
      if (stderr) {
        console.error(stderr);
      }
      resolve(stdout.trim());
    });
  });
}

// Handle type command
async function handleType(command) {
  const builtins = ["echo", "type", "exit", "pwd", "cd"];
  if (builtins.includes(command)) {
    console.log(`${command} is a shell builtin`);
    return;
  }

  const commandPath = await checkIfCommandExistsInPath(command);
  if (commandPath) {
    console.log(`${command} is ${commandPath}`);
  } else {
    console.log(`${command}: not found`);
  }
}

// Handle user input
async function handleAnswer(answer) {
  const [command, ...args] = answer.trim().split(/\s+/);
  if (!command) {
    repeat();
    return;
  }

  switch (command) {
    case "echo":
      handleEcho(args.join(" "));
      break;
    case "type":
      await handleType(args[0]);
      break;
    case "exit":
      rl.close();
      return;
    case "pwd":
      console.log(currWorkDir);
      break;
    case "cd":
      handleChangeDirectory(args[0] || homeDir);
      break;
    default:
      try {
        const output = await handleExternalProgram(command, args);
        console.log(output);
      } catch (err) {
        console.log(`${command}: command not found`);
      }
      break;
  }
  repeat();
}

// Repeat the prompt
function repeat() {
  rl.question("$ ", (answer) => {
    handleAnswer(answer);
  });
}

// Start the shell
repeat();