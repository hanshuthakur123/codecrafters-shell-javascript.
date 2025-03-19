const readline = require("readline/promises");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawnSync } = require("node:child_process");

const HOMEDIR = process.env.HOME || process.env.USERPROFILE || os.homedir();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "$ ",
});

let lastTabInput = "";
let tabPressCount = 0;

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
    const builtins = ["exit", "echo", "type", "pwd", "cd", "cat"];
    const paths = process.env.PATH.split(":");
    const executables = new Set();

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

    const allCommands = [...builtins, ...executables].sort();
    const currentInput = line.trim();
    const hits = allCommands.filter((cmd) => cmd.startsWith(currentInput)).sort();

    if (hits.length === 0) {
        process.stdout.write("\x07");
        return [[], line];
    }

    const lcp = longestCommonPrefix(hits);
    if (lcp.length > currentInput.length) {
        const hasLongerCommands = hits.some(
            (cmd) => cmd.startsWith(lcp) && cmd.length > lcp.length
        );
        if (hasLongerCommands) {
            return [[lcp], line];
        } else {
            return [[lcp + " "], line];
        }
    } else {
        if (hits.length === 1) {
            return [[hits[0] + " "], line];
        } else {
            if (currentInput === lastTabInput && tabPressCount === 1) {
                process.stdout.write("\n" + hits.join("  ") + "\n");
                rl.prompt(true);
                lastTabInput = "";
                tabPressCount = 0;
                return [[], line];
            } else {
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
            if (inDouble) {
                if (ch === "$" || ch === "`" || ch === '"' || ch === "\\" || ch === "\n") {
                    current.push(ch);
                } else {
                    current.push("\\", ch);
                }
            } else {
                current.push(ch);
            }
            escapeNext = false;
            continue;
        }

        if (ch === "\\") {
            if (inSingle) {
                current.push(ch);
            } else {
                escapeNext = true;
            }
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

function handleRedirect(answer) {
    const parts = parseArgs(answer);
    const operators = ["2>>", "1>>", "2>", "1>", ">>", ">"];
    let op = null;
    let opIndex = -1;

    for (let i = 0; i < parts.length; i++) {
        if (operators.includes(parts[i])) {
            op = parts[i];
            opIndex = i;
        }
    }

    if (!op || opIndex === parts.length - 1) return;

    const filename = parts[opIndex + 1];
    const commandParts = parts.slice(0, opIndex);
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
        fs.writeFileSync(filename, content, { flag: flag, mode: 0o644 });

        const consoleStream = isStderr ? process.stdout : process.stderr;
        const consoleOutput = isStderr ? result.stdout : result.stderr;
        if (consoleOutput) {
            consoleStream.write(consoleOutput);
        }
    } catch (err) {
        process.stderr.write(`${commandParts[0]}: ${filename}: ${err.message}\n`);
    }
}

function handleEcho(answer) {
    const parts = parseArgs(answer);
    const output = parts.slice(1).join(" ");
    process.stdout.write(output + "\n");
}

function handleInvalid(answer) {
    process.stdout.write(`${answer}: command not found\n`);
}

function handleExit() {
    rl.close();
}

function handleType(answer) {
    const parts = parseArgs(answer);
    const command = parts[1];
    const builtins = ["exit", "echo", "type", "pwd"];

    if (builtins.includes(command.toLowerCase())) {
        process.stdout.write(`${command} is a shell builtin\n`);
    } else {
        const paths = process.env.PATH.split(":");
        for (const p of paths) {
            const destPath = path.join(p, command);
            if (fs.existsSync(destPath) && fs.statSync(destPath).isFile()) {
                process.stdout.write(`${command} is ${destPath}\n`);
                return;
            }
        }
        process.stdout.write(`${command}: not found\n`);
    }
}

function handleFile(answer) {
    const parts = parseArgs(answer);
    const executable = parts[0];
    const args = parts.slice(1);
    const paths = process.env.PATH.split(":");

    for (const pathEnv of paths) {
        const destPath = path.join(pathEnv, executable);
        if (fs.existsSync(destPath)) {
            const result = spawnSync(destPath, args, {
                encoding: "utf-8",
                stdio: "pipe",
            });

            if (result.error) {
                process.stderr.write(`${executable}: ${result.error.message}\n`);
                return;
            }

            if (result.stdout) {
                process.stdout.write(result.stdout);
            }
            if (result.stderr) {
                process.stderr.write(result.stderr);
            }
            return;
        }
    }

    process.stdout.write(`${executable}: command not found\n`);
}

function handleReadFile(answer) {
    const args = parseArgs(answer).slice(1);
    if (args.length === 0) {
        console.error("cat: missing file operand");
        return;
    }

    for (const filePath of args) {
        try {
            const data = fs.readFileSync(filePath, "utf-8");
            process.stdout.write(data);
        } catch (err) {
            if (err.code === "ENOENT") {
                console.error(`cat: ${filePath}: No such file or directory`);
            } else {
                console.error(`cat: ${filePath}: Permission denied`);
            }
        }
    }
}

function handlePWD() {
    process.stdout.write(`${process.cwd()}\n`);
}

function handleChangeDirectory(answer) {
    const parts = parseArgs(answer);
    const directory = parts[1];

    try {
        if (directory === "~") {
            process.chdir(HOMEDIR);
        } else {
            process.chdir(directory);
        }
        rl.prompt();
    } catch (err) {
        process.stdout.write(`cd: ${directory}: No such file or directory\n`);
    }
}

function handleInput(line) {
    if (line.startsWith("invalid")) {
        handleInvalid(line);
        rl.prompt();
        return;
    }

    const parts = parseArgs(line);
    if (parts.length === 0) {
        rl.prompt();
        return;
    }

    const cmd = parts[0]?.toLowerCase();
    const redirectOperators = ["2>>", "1>>", "2>", "1>", ">>", ">"];
    const foundOperator = redirectOperators.find((op) => parts.includes(op));

    if (foundOperator) {
        handleRedirect(line);
    } else {
        switch (cmd) {
            case "exit":
                handleExit();
                break;
            case "echo":
                handleEcho(line);
                break;
            case "type":
                handleType(line);
                break;
            case "pwd":
                handlePWD();
                break;
            case "cd":
                handleChangeDirectory(line);
                break;
            case "cat":
                handleReadFile(line);
                break;
            default:
                handleFile(line);
        }
    }

    rl.prompt();
}

rl.on("line", handleInput);
rl.on("close", () => {
    process.exit(0);
});

rl.prompt();