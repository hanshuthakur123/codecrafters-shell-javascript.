const readline = require("readline");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ "
});

const BUILTINS = ["type", "echo", "exit"];

rl.prompt();

rl.on("line", (input) => {
  input = input.trim();
  executeCommand(input);
  rl.prompt();
});

function executeCommand(command) {
  const { cmd, args } = parseCommand(command);
  
  switch (cmd) {
    case "exit":
      process.exit(0);
      break;
    case "echo":
      echoCommand(args);
      break;
    case "type":
      typeCommand(args[0]);
      break;
    default:
      console.log(`${cmd}: command not found`);
  }
}

function parseCommand(input) {
  const args = input.split(/\s+/);
  const cmd = args.shift();
  return { cmd, args };
}

function echoCommand(args) {
  if (args.length === 0) {
    console.log("No message provided");
  } else {
    console.log(args.join(" "));
  }
}

function typeCommand(cmdName) {
  if (!cmdName) {
    console.log("No command name provided");
    return;
  }

  if (BUILTINS.includes(cmdName)) {
    console.log(`${cmdName} is a shell builtin`);
    return;
  }

  const paths = process.env.PATH.split(path.delimiter);
  let found = false;
  
  for (let dir of paths) {
    const fullPath = path.join(dir, cmdName);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      console.log(`${cmdName} is ${fullPath}`);
      found = true;
      break;
    }
  }

  if (!found) {
    console.log(`${cmdName}: not found`);
  }
}
