const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Constants
const BUILTIN_COMMANDS = new Set(["exit", "echo", "cd", "pwd", "type"]);
const REDIRECTION_OPERATORS = new Set([">", ">>", "1>", "2>", "1>>", "2>>"]);

// Readline Interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer,
});

// State Variables
let lastTabLine = "";
let tabPressCount = 0;

// ----- Helper Functions -----

/**
 * Find executables in PATH matching the given prefix.
 */
function findExecutablesInPath(prefix) {
  const pathDirs = process.env.PATH.split(path.delimiter);
  const executables = [];

  pathDirs.forEach((dir) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        if (file.startsWith(prefix)) {
          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);
            const isExecutable =
              process.platform === "win32" ? stats.isFile() : stats.isFile() && stats.mode & 0o111;

            if (isExecutable) executables.push(file);
          } catch (error) {}
        }
      });
    }
  });

  return executables;
}

/**
 * Tab completion handler.
 */
function completer(line) {
  const trimmedLine = line.trim();
  if (trimmedLine === lastTabLine) {
    tabPressCount++;
  } else {
    tabPressCount = 1;
    lastTabLine = trimmedLine;
  }

  if (!trimmedLine) return [[...BUILTIN_COMMANDS], line];

  const builtinHits = [...BUILTIN_COMMANDS].filter((cmd) => cmd.startsWith(trimmedLine));
  const pathExecutables = findExecutablesInPath(trimmedLine);
  const allHits = [...builtinHits, ...pathExecutables];

  if (!allHits.length) {
    process.stdout.write("\x07");  // Bell sound if no matches
    return [[], line];
  }

  if (allHits.length === 1) {
    tabPressCount = 0;
    return [[allHits[0]], line];  // Return the matched command without adding extra space
  } else {
    if (tabPressCount >= 2) {
      console.log(allHits.join(" "));
      rl.prompt();
      return [[], line];
    }
    process.stdout.write("\x07");  // Bell sound for multiple matches
    return [[], line];
  }
}

/**
 * Parses arguments respecting POSIX-like quoting rules.
 */
function parseArguments(input) {
  const args = [];
  let currentArg = "";
  let inSingleQuotes = false, inDoubleQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "\\") {
      if (i + 1 < input.length) currentArg += input[++i];
      else currentArg += "\\";
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (char === " " && !inSingleQuotes && !inDoubleQuotes) {
      if (currentArg) {
        args.push(currentArg);
        currentArg = "";
      }
      continue;
    }

    currentArg += char;
  }

  if (currentArg) args.push(currentArg);
  return args;
}

/**
 * Parses redirection operators.
 */
function parseRedirection(input) {
  const operators = Array.from(REDIRECTION_OPERATORS).sort((a, b) => b.length - a.length);

  for (const op of operators) {
    const parts = input.split(op);
    if (parts.length > 1) {
      return { command: parts[0].trim(), operator: op, file: parts.slice(1).join(op).trim() };
    }
  }

  return { command: input, operator: null, file: null };
}

/**
 * Ensures a directory exists.
 */
function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Writes content to a file (with optional append mode).
 */
function writeToFile(file, content, append = false) {
  try {
    ensureDirExists(file);
    append ? fs.appendFileSync(file, content) : fs.writeFileSync(file, content);
  } catch (error) {
    console.error(`Error writing to ${file}: ${error.message}`);
  }
}

// ----- Command Handlers -----

function handleExit(args) {
  const exitCode = args[0] ? parseInt(args[0]) : 0;
  isNaN(exitCode) ? console.error("exit: numeric argument required") : process.exit(exitCode);
}

function handleCd(args) {
  const targetDir = args[0] || process.env.HOME;
  try {
    process.chdir(targetDir);
  } catch (error) {
    console.error(`cd: ${targetDir}: No such file or directory`);
  }
}

function handleType(args) {
  const command = args[0];
  if (!command) {
    console.error("Usage: type [command]");
  } else if (BUILTIN_COMMANDS.has(command)) {
    console.log(`${command} is a shell builtin`);
  } else {
    const found = process.env.PATH.split(path.delimiter).some((dir) => {
      const fullPath = path.join(dir, command);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        console.log(`${command} is ${fullPath}`);
        return true;
      }
      return false;
    });
    if (!found) console.log(`${command}: not found`);
  }
}

function handleEcho(args) {
  console.log(args.join(" "));
}

function handlePwd() {
  console.log(process.cwd());
}

function handleExternalCommand(command, args, redirection) {
  const found = process.env.PATH.split(path.delimiter).some((dir) => {
    const fullPath = path.join(dir, command);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      try {
        const result = spawnSync(fullPath, args, { encoding: "utf-8", stdio: ["inherit", "pipe", "pipe"] });

        if (redirection.operator) {
          const content = redirection.operator.startsWith("2") ? result.stderr : result.stdout;
          writeToFile(redirection.file, content, redirection.operator.endsWith(">>"));
        } else {
          process.stdout.write(result.stdout || "");
          process.stderr.write(result.stderr || "");
        }
      } catch (error) {
        console.error(`Error executing ${command}: ${error.message}`);
      }
      return true;
    }
    return false;
  });

  if (!found) console.error(`${command}: command not found`);
}

// ----- Main REPL Loop -----

function prompt() {
  rl.question("$ ", (answer) => {
    if (!answer.trim()) {
      prompt();
      return;
    }

    lastTabLine = "";
    tabPressCount = 0;

    const { command, operator, file } = parseRedirection(answer);
    const args = parseArguments(command);
    const cmd = args[0];

    if (!cmd) {
      prompt();
      return;
    }

    switch (cmd) {
      case "exit":
        handleExit(args.slice(1));
        break;
      case "cd":
        handleCd(args.slice(1));
        break;
      case "type":
        handleType(args.slice(1));
        break;
      case "echo":
        handleEcho(args.slice(1));
        break;
      case "pwd":
        handlePwd();
        break;
      default:
        handleExternalCommand(cmd, args.slice(1), { operator, file });
    }

    prompt();
  });
}

prompt();
