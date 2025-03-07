const readline = require("readline");
const fs = require("fs");
const childProcess = require("child_process");
const os = require("os");
const { join } = require("path");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function externalPath(command) {
  return process.env.PATH.split(":").find((path) => {
    return fs.existsSync(join(path, command));
  });
}
function parseArgs(input) {
  let chunks = [];
  let singleQuoteOpen = false;
  let doubleQuoteOpen = false;
  let backslashOpen = false;
  let incompleteArg = "";
  let outputDestination;
  input
    .trim()
    .split("")
    .forEach((char) => {
      let backslashJustOpened = false;
      if (char === "'" && !doubleQuoteOpen && !backslashOpen) {
        singleQuoteOpen = !singleQuoteOpen;
      } else if (char === '"' && !singleQuoteOpen && !backslashOpen) {
        doubleQuoteOpen = !doubleQuoteOpen;
      } else if (
        char === "\\" &&
        !singleQuoteOpen &&
        !backslashOpen &&
        chunks.length > 0
      ) {
        backslashOpen = true;
        backslashJustOpened = true;
      } else if (
        backslashOpen &&
        !backslashJustOpened &&
        ["\\", "$", '"', "\n"].includes(char)
      ) {
        incompleteArg = incompleteArg.concat(char);
      } else if (
        char === " " &&
        !singleQuoteOpen &&
        !doubleQuoteOpen &&
        !backslashOpen &&
        incompleteArg.trim() !== ""
      ) {
        chunks.push(incompleteArg.trim());
        incompleteArg = "";
      } else {
        incompleteArg = incompleteArg.concat(char);
      }
      if (backslashOpen && !backslashJustOpened) {
        backslashOpen = false;
      }
    });
  chunks.push(incompleteArg.trim());
  if (chunks[chunks.length - 2] === ">" || chunks[chunks.length - 2] === "1>") {
    outputDestination = chunks[chunks.length - 1];
    chunks = chunks.slice(0, -2);
  }
  const [command, ...args] = chunks;
  return { command, args, outputDestination };
}
function log(outputDestination, content) {
  if (outputDestination) {
    fs.writeFileSync(outputDestination, content);
  } else {
    console.log(content);
  }
}
function prompt() {
  rl.question("$ ", (answer) => {
    const { command, args, outputDestination } = parseArgs(answer);
    const builtinCmds = [];
    const isBuiltin = (command, candidate) => {
      builtinCmds.push(candidate);
      return command === candidate;
    };
    if (isBuiltin(command, "exit")) {
      process.exit(args[0]);
    }
    if (isBuiltin(command, "cd")) {
      const path = args[0].replace("~", os.homedir());
      try {
        process.chdir(path);
      } catch (err) {
        log(outputDestination, `cd: ${path}: No such file or directory`);
      }
      prompt();
      return;
    }
    if (isBuiltin(command, "pwd")) {
      log(outputDestination, process.cwd());
      prompt();
      return;
    }
    if (isBuiltin(command, "echo")) {
      log(outputDestination, args.join(" "));
      prompt();
      return;
    }
    if (isBuiltin(command, "type")) {
      if (builtinCmds.includes(args[0])) {
        log(outputDestination, `${args[0]} is a shell builtin`);
      } else {
        const path = externalPath(args[0]);
        if (path) {
          log(outputDestination, `${args[0]} is ${path}/${args[0]}`);
        } else {
          log(outputDestination, `${args[0]}: not found`);
        }
      }
      prompt();
      return;
    }
    if (externalPath(command)) {
      let output;
      try {
        output = childProcess.execSync(answer).toString().trim();
      } catch (e) {}
      if (!outputDestination && output) {
        log(outputDestination, output);
      }
      prompt();
      return;
    }
    log(outputDestination, `${answer}: command not found`);
    prompt();
  });
}
prompt();