const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Create a readline interface for input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

// List of built-in commands
const BUILTIN_CMDS = ["type", "echo", "exit", "pwd", "cd"];

// Start the shell prompt
rl.prompt();

// Handle user input
rl.on("line", (input) => {
  input = input.trim(); // Remove leading/trailing whitespace
  execCmd(input, () => rl.prompt()); // Execute the command and re-prompt
});

// Execute the command
function execCmd(command, callback) {
  const { cmd, args } = parseCommand(command); // Parse the command and arguments

  if (BUILTIN_CMDS.includes(cmd)) {
    handleBuiltinCmd(cmd, args, callback); // Handle built-in commands
  } else {
    handleExternalCmd(cmd, args, callback); // Handle external commands
  }
}

// Parse the command into cmd and args
function parseCommand(input) {
  const parts = input.split(/\s+/); // Split input by whitespace
  const cmd = parts[0]; // First part is the command
  const args = parts.slice(1); // Remaining parts are arguments
  return { cmd, args };
}

// Handle built-in commands
function handleBuiltinCmd(cmd, args, callback) {
  switch (cmd) {
    case "exit":
      process.exit(args[0] ? parseInt(args[0]) : 0); // Exit with optional status code
      break;
    case "echo":
      console.log(args.join(" ")); // Echo the arguments
      callback();
      break;
    case "type":
      printType(args[0]); // Print the type of the command
      callback();
      break;
    case "pwd":
      console.log(process.cwd()); // Print the current working directory
      callback();
      break;
    case "cd":
      handleCd(args[0]); // Change the directory
      callback();
      break;
    default:
      callback();
  }
}

// Handle external commands
function handleExternalCmd(cmd, args, callback) {
  const paths = process.env.PATH.split(path.delimiter); // Get paths from PATH environment variable
  let found = false;

  // Search for the command in each path
  for (const p of paths) {
    const fullPath = path.join(p, cmd); // Construct the full path to the command
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      found = true;

      // Spawn a child process to execute the command
      const child = spawn(fullPath, args);

      // Capture the output of the child process
      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString(); // Collect output
      });

      // When the process exits, modify the output and print it
      child.on("close", (code) => {
        // Replace the full path with just the program name
        const modifiedOutput = output.replace(
          new RegExp(fullPath, "g"),
          cmd
        );
        console.log(modifiedOutput.trim()); // Print the modified output
        callback();
      });

      // Handle errors
      child.on("error", (err) => {
        console.error(err);
        callback();
      });

      break;
    }
  }

  // If the command is not found, print an error message
  if (!found) {
    console.log(`${cmd}: command not found`);
    callback();
  }
}

// Handle the cd command
function handleCd(dir) {
  if (!dir) {
    console.log("cd: missing argument"); // Handle missing directory argument
    return;
  }

  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      process.chdir(dir); // Change the directory
    } else {
      console.log(`cd: ${dir}: No such file or directory`); // Print error if directory doesn't exist
    }
  } catch (err) {
    console.log(`cd: ${dir}: No such file or directory`); // Handle any errors
  }
}

// Print the type of a command
function printType(cmdName) {
  if (BUILTIN_CMDS.includes(cmdName)) {
    console.log(`${cmdName} is a shell builtin`); // Built-in command
    return;
  }

  const paths = process.env.PATH.split(path.delimiter); // Get paths from PATH environment variable
  for (const p of paths) {
    const fullPath = path.join(p, cmdName); // Construct the full path to the command
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      console.log(`${cmdName} is ${fullPath}`); // External command
      return;
    }
  }

  console.log(`${cmdName}: not found`); // Command not found
}