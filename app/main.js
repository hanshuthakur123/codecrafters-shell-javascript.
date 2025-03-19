const readline = require("readline/promises");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFileSync, spawnSync } = require("node:child_process");

// Constants
const HOMEDIR = process.env.HOME || process.env.USERPROFILE || os.homedir();
const BUILTIN_COMMANDS = ["exit", "echo", "type", "pwd", "cd", "cat"];
const REDIRECT_OPERATORS = ["2>>", "1>>", "2>", "1>", ">>", ">"];

// Readline Interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
    prompt: "$ ",
});

let lastTabInput = "";
let tabPressCount = 0;

// Utility Functions
function longestCommonPrefix(strings) {
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

function completer(line) {
  const paths = process.env.PATH.split(":");
  const executables = new Set();

  // Collect executable files from PATH directories
  for (const dir of paths) {
      try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
              const fullPath = path.join(dir, file);
              try {
                  fs.accessSync(fullPath, fs.constants.X_OK);
                  const stats = fs.statSync(fullPath);
                  if (stats.isFile()) {
                      executables.add(file);
                  }
              } catch (e) {
                  // Skip non-executable files
              }
          }
      } catch (e) {
          // Skip inaccessible directories
      }
  }

  const allCommands = [...BUILTIN_COMMANDS, ...executables].sort();
  const currentInput = line.trim();
  const hits = allCommands.filter((cmd) => cmd.startsWith(currentInput)).sort();

  if (hits.length === 0) {
      process.stdout.write("\x07"); // Ring the bell for no matches
      return [[], line];
  }

  const lcp = longestCommonPrefix(hits);
  if (lcp.length > currentInput.length) {
      const hasLongerCommands = hits.some((cmd) => cmd.startsWith(lcp) && cmd.length > lcp.length);
      if (hasLongerCommands) {
          return [[lcp], line]; // Complete to the longest common prefix
      } else {
          return [[lcp + " "], line]; // Complete and add a space
      }
  } else {
      if (hits.length === 1) {
          return [[hits[0] + " "], line]; // Complete the single match
      } else {
          if (currentInput === lastTabInput && tabPressCount === 1) {
              // Display the list of matches on the second TAB press
              process.stdout.write("\n" + hits.join("  ") + "\n");
              rl.prompt(true); // Reset the prompt
              lastTabInput = "";
              tabPressCount = 0;
              return [[], line];
          } else {
              // Ring the bell on the first TAB press
              process.stdout.write("\x07");
              lastTabInput = currentInput;
              tabPressCount = 1;
              return [[], line];
          }
      }
  }
}
function parseArgs(input) {
    let args = [];
    let current = [];
    let inSingle = false;
    let inDouble = false;
    let escapeNext = false;

    for (let i = 0; i < input.length; i++) {
        let ch = input[i];
        if (escapeNext) {
            if (inDouble && ["$", "`", '"', "\\", "\n"].includes(ch)) {
                current.push(ch);
            } else {
                current.push("\\", ch);
            }
            escapeNext = false;
            continue;
        }

        if (ch === "\\") {
            if (!inSingle) escapeNext = true;
            else current.push(ch);
            continue;
        }

        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            continue;
        }

        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            continue;
        }

        if (ch === " " && !inSingle && !inDouble) {
            if (current.length > 0) {
                args.push(current.join(""));
                current = [];
            }
            continue;
        }

        current.push(ch);
    }

    if (current.length > 0) {
        args.push(current.join(""));
    }

    return args;
}

// Command Handlers
function handleEcho(args) {
    process.stdout.write(args.slice(1).join(" ") + "\n");
}

function handleExit() {
    rl.close();
}

function handleType(args) {
    const command = args[1];
    if (BUILTIN_COMMANDS.includes(command.toLowerCase())) {
        process.stdout.write(`${command} is a shell builtin\n`);
    } else {
        const paths = process.env.PATH.split(":");
        for (const p of paths) {
            let destPath = path.join(p, command);
            if (fs.existsSync(destPath)) {
                process.stdout.write(`${command} is ${destPath}\n`);
                return;
            }
        }
        process.stdout.write(`${command}: not found\n`);
    }
}

function handlePWD() {
    process.stdout.write(`${process.cwd()}\n`);
}

function handleChangeDirectory(args) {
    const directory = args[1] || HOMEDIR;
    try {
        process.chdir(directory);
    } catch (err) {
        process.stdout.write(`cd: ${directory}: No such file or directory\n`);
    }
}

function handleReadFile(args) {
    if (args.length < 2) {
        console.error("cat: missing file operand");
        return;
    }

    for (const filePath of args.slice(1)) {
        try {
            const data = fs.readFileSync(filePath, "utf-8");
            process.stdout.write(data);
        } catch (err) {
            console.error(`cat: ${filePath}: ${err.code === "ENOENT" ? "No such file or directory" : "Permission denied"}`);
        }
    }
}

function handleFile(args) {
    const executable = args[0];
    const paths = process.env.PATH.split(":");
    for (const pathEnv of paths) {
        let destPath = path.join(pathEnv, executable);
        if (fs.existsSync(destPath)) {
            execFileSync(destPath, args.slice(1), {
                encoding: "utf-8",
                stdio: "pipe",
                argv0: executable,
            });
            return;
        }
    }
    process.stdout.write(`${executable}: command not found\n`);
}

function handleRedirect(args) {
    const opIndex = args.findIndex((arg) => REDIRECT_OPERATORS.includes(arg));
    if (opIndex === -1 || opIndex === args.length - 1) return;

    const op = args[opIndex];
    const filename = args[opIndex + 1];
    const commandParts = args.slice(0, opIndex);

    if (commandParts.length === 0) return;

    const isAppend = op.endsWith(">>");
    const isStderr = op.startsWith("2");
    const flag = isAppend ? "a" : "w";

    const result = spawnSync(commandParts[0], commandParts.slice(1), {
        encoding: "utf-8",
        stdio: ["inherit", "pipe", "pipe"],
    });

    try {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        const content = (isStderr ? result.stderr : result.stdout) || "";
        fs.writeFileSync(filename, content, { flag, mode: 0o644 });

        const consoleStream = isStderr ? process.stdout : process.stderr;
        const consoleOutput = isStderr ? result.stdout : result.stderr;
        if (consoleOutput) consoleStream.write(consoleOutput);
    } catch (err) {
        process.stderr.write(`${commandParts[0]}: ${filename}: ${err.message}\n`);
    }
}

// Main Input Handler
function handleInput(line) {
    const args = parseArgs(line);
    if (args.length === 0) {
        rl.prompt();
        return;
    }

    const cmd = args[0]?.toLowerCase();
    const hasRedirect = args.some((arg) => REDIRECT_OPERATORS.includes(arg));

    if (hasRedirect) {
        handleRedirect(args);
    } else {
        switch (cmd) {
            case "exit":
                handleExit();
                break;
            case "echo":
                handleEcho(args);
                break;
            case "type":
                handleType(args);
                break;
            case "pwd":
                handlePWD();
                break;
            case "cd":
                handleChangeDirectory(args);
                break;
            case "cat":
                handleReadFile(args);
                break;
            default:
                handleFile(args);
        }
    }

    rl.prompt();
}

// Event Listeners
rl.on("line", handleInput);
rl.on("close", () => process.exit(0));

// Start REPL
rl.prompt();