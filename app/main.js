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
  completer: completer,
});

// Tab Completion State
let lastTabLine = "";
let tabPressCount = 0;

// ----- Helper Functions -----

/**
 * Finds executable files in PATH that match a given prefix.
 */
function findExecutablesInPath(prefix) {
  const pathDirs = process.env.PATH.split(path.delimiter);
  const executables = [];

  for (const dir of pathDirs) {
    try {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(prefix)) {
          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);
            const isExecutable =
              process.platform === "win32"
                ? stats.isFile()
                : stats.isFile() && stats.mode & 0o111;

            if (isExecutable) executables.push(file);
          } catch (error) {
            continue; // Skip inaccessible files
          }
        }
      }
    } catch (error) {
      continue; // Skip inaccessible directories
    }
  }

  return executables;
}

/**
 * Provides tab completion for commands and executables.
 */
function completer(line) {
  const trimmedLine = line.trim();

  if (trimmedLine === lastTabLine) {
    tabPressCount++;
  } else {
    tabPressCount = 1;
    lastTabLine = trimmedLine;
  }

  if (trimmedLine === "") {
    return [[...BUILTIN_COMMANDS], line];
  }

  const builtinHits = [...BUILTIN_COMMANDS].filter((cmd) =>
    cmd.startsWith(trimmedLine)
  );
  const pathExecutables = findExecutablesInPath(trimmedLine);
  const allHits = [...builtinHits, ...pathExecutables];
  const uniqueHits = [...new Set(allHits)].sort(); // Sort the matches alphabetically

  if (uniqueHits.length === 0) {
    process.stdout.write("\x07"); // Bell sound
    return [[], line];
  }

  if (uniqueHits.length === 1) {
    tabPressCount = 0;
    return [[uniqueHits[0] + " "], line];
  } else {
    if (tabPressCount === 1) {
      process.stdout.write("\x07");
      return [[], line];
    } else if (tabPressCount >= 2) {
      console.log();
      console.log(uniqueHits.join("  ")); // Display sorted matches
      rl.prompt();
      return [[], line];
    }
    return [[], line];
  }
}

/**
 * Parses input into arguments, respecting POSIX-like quoting rules.
 */
function parseArguments(input) {
  const args = [];
  let currentArg = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "\\") {
      if (i + 1 < input.length) {
        currentArg += input[++i];
      } else {
        currentArg += "\\";
      }
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
 * Parses redirection operators from the input.
 */
function parseRedirection(input) {
  const operators = Array.from(REDIRECTION_OPERATORS).sort(
    (a, b) => b.length - a.length
  );

  for (const op of operators) {
    const parts = input.split(op);
    if (parts.length > 1) {
      return {
        command: parts[0].trim(),
        operator: op,
        file: parts.slice(1).join(op).trim(),
      };
    }
  }

  return { command: input, operator: null, file: null };
}

/**
 * Ensures a directory exists, creating it if necessary.
 */
function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Writes content to a file, with optional appending.
 */
function writeToFile(file, content, append = false) {
  try {
    ensureDirExists(file);
    if (append) {
      fs.appendFileSync(file, content);
    } else {
      fs.writeFileSync(file, content);
    }
    return true;
  } catch (error) {
    console.error(`Error writing to ${file}: ${error.message}`);
    return false;
  }
}

// ----- Command Handlers -----

function handleExit(args) {
  const exitCode = args[0] ? parseInt(args[0]) : 0;
  if (isNaN(exitCode)) {
    console.error("exit: numeric argument required");
  } else {
    process.exit(exitCode);
  }
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
    const paths = process.env.PATH.split(path.delimiter);
    let found = false;
    for (const dir of paths) {
      const fullPath = path.join(dir, command);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        console.log(`${command} is ${fullPath}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`${command}: not found`);
    }
  }
}

function handleEcho(args) {
  console.log(args.join(" "));
}

function handlePwd() {
  console.log(process.cwd());
}

function handleExternalCommand(command, args, redirection) {
  const paths = process.env.PATH.split(path.delimiter);
  let found = false;

  for (const dir of paths) {
    const fullPath = path.join(dir, command);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      found = true;
      try {
        const result = spawnSync(fullPath, args, {
          encoding: "utf-8",
          stdio: ["inherit", "pipe", "pipe"],
        });

        if (redirection.operator) {
          const content =
            redirection.operator.startsWith("2") ? result.stderr : result.stdout;
          const append = redirection.operator.endsWith(">>");
          writeToFile(redirection.file, content, append);
        } else {
          process.stdout.write(result.stdout || "");
          process.stderr.write(result.stderr || "");
        }
      } catch (error) {
        console.error(`Error executing ${command}: ${error.message}`);
      }
      break;
    }
  }

  if (!found) {
    console.error(`${command}: command not found`);
  }
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