const readline = require("readline");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => {
    const builtins = ["echo ", "exit "];
    const pathDirs = (process.env.PATH || "").split(":");
    let externalCommands = [];
    // Collect executable files from PATH
    for (const dir of pathDirs) {
      try {
        const files = fsSync.readdirSync(dir);
        files.forEach((file) => {
          const fullPath = path.join(dir, file);
          try {
            fsSync.accessSync(fullPath, fsSync.constants.X_OK);
            externalCommands.push(file + " ");
          } catch (err) {
            // Not executable, skip
          }
        });
      } catch (err) {
        // Directory not accessible, skip
      }
    }
    const allCommands = [...new Set([...builtins, ...externalCommands])]; // Unique commands
    const hits = allCommands.filter((c) => c.startsWith(line));
    return [hits, line];
  },
  prompt: "$ ",
});
// Custom TAB handling
process.stdin.on('data', (data) => {
  const input = data.toString();
  if (input === '\t') { // TAB key
    const line = rl.line || ""; // Current input buffer
    const builtins = ["echo ", "exit "];
    const pathDirs = (process.env.PATH || "").split(":");
    let externalCommands = [];
    // Collect executable files from PATH
    for (const dir of pathDirs) {
      try {
        const files = fsSync.readdirSync(dir);
        files.forEach((file) => {
          const fullPath = path.join(dir, file);
          try {
            fsSync.accessSync(fullPath, fsSync.constants.X_OK);
            externalCommands.push(file + " ");
          } catch (err) {
            // Not executable, skip
          }
        });
      } catch (err) {
        // Directory not accessible, skip
      }
    }
    const allCommands = [...new Set([...builtins, ...externalCommands])]; // Unique commands
    const hits = allCommands.filter((c) => c.startsWith(line));
    if (hits.length > 0) {
      rl.write(null, { ctrl: true, name: 'u' }); // Clear line
      rl.write(hits[0]); // Complete with first match
    } else {
      process.stdout.write('\x07'); // Bell for no matches
    }
  }
});
function parseArguments(input) {
  const args = [];
  let currentArg = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === "\\" && !inSingleQuotes && !inDoubleQuotes && i + 1 < input.length) {
      currentArg += input[i + 1];
      i += 2;
    } else if (char === "'" && !inDoubleQuotes && !inSingleQuotes) {
      inSingleQuotes = true;
      i++;
    } else if (char === "'" && inSingleQuotes) {
      inSingleQuotes = false;
      if (i + 1 < input.length && input[i + 1] === "'") {
        i++;
        inSingleQuotes = true;
      } else {
        args.push(currentArg);
        currentArg = "";
      }
      i++;
    } else if (char === "\"" && !inSingleQuotes && !inDoubleQuotes) {
      inDoubleQuotes = true;
      i++;
    } else if (char === "\"" && inDoubleQuotes) {
      inDoubleQuotes = false;
      if (i + 1 < input.length && input[i + 1] === "\"") {
        i++;
        inDoubleQuotes = true;
      }
      i++;
    } else if (char === "\\" && inDoubleQuotes && i + 1 < input.length) {
      const nextChar = input[i + 1];
      if (nextChar === "\\" || nextChar === "$" || nextChar === "\"" || nextChar === "\n") {
        currentArg += nextChar;
        i += 2;
      } else {
        currentArg += char;
        i++;
      }
    } else if (char === " " && !inSingleQuotes && !inDoubleQuotes) {
      if (currentArg) {
        args.push(currentArg);
        currentArg = "";
      }
      i++;
    } else {
      currentArg += char;
      i++;
    }
  }
  if (currentArg) {
    args.push(currentArg);
  }
  return args;
}
function parseCommand(input) {
  const trimmed = input.trim();
  const stdoutAppendIndex = trimmed.indexOf("1>>");
  const stderrAppendIndex = trimmed.indexOf("2>>");
  const stderrRedirectIndex = trimmed.indexOf("2>");
  const stdoutRedirectIndex = trimmed.indexOf("1>");
  const simpleAppendIndex = trimmed.indexOf(">>");
  const simpleRedirectIndex = trimmed.indexOf(">");
  let commandPart, stdoutFile, stderrFile, appendStdout = false, appendStderr = false;
  if (stderrAppendIndex !== -1) {
    commandPart = trimmed.slice(0, stderrAppendIndex).trim();
    stderrFile = trimmed.slice(stderrAppendIndex + 3).trim();
    appendStderr = true;
  } else if (stdoutAppendIndex !== -1) {
    commandPart = trimmed.slice(0, stdoutAppendIndex).trim();
    stdoutFile = trimmed.slice(stdoutAppendIndex + 3).trim();
    appendStdout = true;
  } else if (stderrRedirectIndex !== -1) {
    commandPart = trimmed.slice(0, stderrRedirectIndex).trim();
    stderrFile = trimmed.slice(stderrRedirectIndex + 2).trim();
  } else if (stdoutRedirectIndex !== -1) {
    commandPart = trimmed.slice(0, stdoutRedirectIndex).trim();
    stdoutFile = trimmed.slice(stdoutRedirectIndex + 2).trim();
  } else if (simpleAppendIndex !== -1) {
    commandPart = trimmed.slice(0, simpleAppendIndex).trim();
    stdoutFile = trimmed.slice(simpleAppendIndex + 2).trim();
    appendStdout = true;
  } else if (simpleRedirectIndex !== -1) {
    commandPart = trimmed.slice(0, simpleRedirectIndex).trim();
    stdoutFile = trimmed.slice(simpleRedirectIndex + 1).trim();
  } else {
    commandPart = trimmed;
  }
  return { command: commandPart, stdoutFile, stderrFile, appendStdout, appendStderr };
}
async function processCommand(answer) {
  const { command, stdoutFile, stderrFile, appendStdout, appendStderr } = parseCommand(answer);
  const args = parseArguments(command);
  if (args[0] === "exit" && args[1] === "0") { // Exit command
    process.exit(0);
  } else if (args[0] === "echo") { // Echo command
    const echoOutput = args.slice(1).join(" ");
    if (stdoutFile) {
      fsSync.writeFileSync(stdoutFile, echoOutput + "\n", { flag: appendStdout ? 'a' : 'w' });
    } else if (stderrFile) {
      console.log(echoOutput);
      fsSync.writeFileSync(stderrFile, "", { flag: appendStderr ? 'a' : 'w' });
    } else {
      console.log(echoOutput);
    }
  } else if (args[0] === "pwd") { // Pwd command
    const output = process.cwd();
    if (stdoutFile) {
      fsSync.writeFileSync(stdoutFile, output + "\n", { flag: appendStdout ? 'a' : 'w' });
    } else if (stderrFile) {
      console.log(output);
      fsSync.writeFileSync(stderrFile, "", { flag: appendStderr ? 'a' : 'w' });
    } else {
      console.log(output);
    }
  } else if (args[0] === "cd" && args[1]) { // Cd command
    let targetPath = args[1];
    if (targetPath === "~") {
      targetPath = process.env.HOME || "/";
    }
    try {
      const absolutePath = path.resolve(targetPath);
      process.chdir(absolutePath);
    } catch (err) {
      const errorMsg = `cd: ${args[1]}: No such file or directory`;
      if (stderrFile) {
        fsSync.writeFileSync(stderrFile, errorMsg + "\n", { flag: appendStderr ? 'a' : 'w' });
      } else {
        console.log(errorMsg);
      }
    }
  } else if (args[0] === "type" && args[1]) { // Type command
    const arg = args[1];
    const builtins = ["echo", "exit", "type", "pwd", "cd"];
    let output, errorMsg;
    if (builtins.includes(arg)) {
      output = `${arg} is a shell builtin`;
    } else {
      try {
        const result = await checkPath(arg);
        output = result;
      } catch (err) {
        errorMsg = `${arg}: not found`;
      }
    }
    if (stdoutFile) {
      fsSync.writeFileSync(stdoutFile, (output || "") + "\n", { flag: appendStdout ? 'a' : 'w' });
    } else if (stderrFile) {
      if (output) console.log(output);
      fsSync.writeFileSync(stderrFile, (errorMsg || "") + "\n", { flag: appendStderr ? 'a' : 'w' });
    } else {
      if (output) console.log(output);
      else if (errorMsg) console.log(errorMsg);
    }
  } else if (args.length > 0) { // External command or invalid
    const commandName = args[0];
    const commandArgs = args.slice(1);
    const builtins = ["echo", "exit", "type", "pwd", "cd"];
    if (!builtins.includes(commandName)) {
      try {
        const fullPath = await findExecutable(commandName);
        if (stdoutFile) {
          await runExecutableWithRedirect(fullPath, commandName, commandArgs, stdoutFile, "stdout", appendStdout);
        } else if (stderrFile) {
          await runExecutableWithRedirect(fullPath, commandName, commandArgs, stderrFile, "stderr", appendStderr);
        } else {
          const output = await runExecutable(fullPath, commandName, commandArgs);
          console.log(output.trim());
        }
      } catch (err) {
        if (err.message === "Executable not found") {
          const errorMsg = `${commandName}: command not found`;
          if (stderrFile) {
            fsSync.writeFileSync(stderrFile, errorMsg + "\n", { flag: appendStderr ? 'a' : 'w' });
          } else {
            console.log(errorMsg);
          }
        }
      }
    } else {
      console.log(`${commandName}: command not found`);
    }
  }
}
async function checkPath(command) {
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, command);
    try {
      await fs.access(fullPath, fs.constants.X_OK);
      return `${command} is ${fullPath}`;
    } catch (err) {
      // Continue to next dir
    }
  }
  throw new Error("Executable not found");
}
async function findExecutable(command) {
  const pathDirs = (process.env.PATH || "").split(":");
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, command);
    try {
      await fs.access(fullPath, fs.constants.X_OK);
      return fullPath;
    } catch (err) {
      // Continue to next dir
    }
  }
  throw new Error("Executable not found");
}
function runExecutable(fullPath, commandName, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(fullPath, args, { argv0: commandName });
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Process exited with code ${code}`));
    });
    proc.on("error", (err) => reject(err));
  });
}
function runExecutableWithRedirect(fullPath, commandName, args, filePath, redirectType = "stdout", append = false) {
  return new Promise((resolve, reject) => {
    const fileStream = fsSync.createWriteStream(filePath, { flags: append ? 'a' : 'w' });
    const proc = spawn(fullPath, args, { argv0: commandName });
    if (redirectType === "stdout") {
      proc.stdout.pipe(fileStream);
      proc.stderr.on("data", (data) => {
        process.stderr.write(data);
      });
    } else if (redirectType === "stderr") {
      proc.stderr.pipe(fileStream);
      proc.stdout.on("data", (data) => {
        process.stdout.write(data);
      });
    }
    proc.on("close", (code) => {
      fileStream.end();
      resolve();
    });
    proc.on("error", (err) => reject(err));
  });
}
// Start the shell
rl.on("line", async (line) => {
  const trimmedLine = line.trim();
  if (trimmedLine) {
    await processCommand(trimmedLine);
  }
  rl.prompt();
}).on("close", () => {
  process.exit(0);
});
rl.prompt();