const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

class SimpleShell {
  constructor() {
    this.lastTabLine = '';
    this.tabPressCount = 0;

    this.builtinCommands = {
      'exit': this.exitCommand.bind(this),
      'cd': this.cdCommand.bind(this),
      'pwd': this.pwdCommand.bind(this),
      'echo': this.echoCommand.bind(this),
      'type': this.typeCommand.bind(this)
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.tabCompleter.bind(this)
    });
  }

  start() {
    this.promptUser();
  }

  promptUser() {
    this.rl.question('$ ', (input) => {
      if (!input.trim()) {
        this.promptUser();
        return;
      }

      this.lastTabLine = '';
      this.tabPressCount = 0;

      this.executeCommand(input);
    });
  }

  executeCommand(input) {
    const { command, stdoutFile, stderrFile, appendStdout, appendStderr } = this.parseRedirection(input);
    const args = this.parseArguments(command);

    if (!args.length) {
      this.promptUser();
      return;
    }

    const cmd = args[0];
    const cmdArgs = args.slice(1);

    if (this.builtinCommands[cmd]) {
      this.builtinCommands[cmd](cmdArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
    } else {
      this.executeExternalCommand(cmd, cmdArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
    }
  }

  exitCommand(args) {
    const exitCode = args.length ? parseInt(args[0]) || 0 : 0;
    process.exit(exitCode);
  }

  cdCommand(args) {
    const targetDir = args[0] || process.env.HOME;
    try {
      process.chdir(path.resolve(targetDir));
    } catch (error) {
      console.error(`cd: ${targetDir}: No such file or directory`);
    }
    this.promptUser();
  }

  pwdCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = process.cwd();
    this.handleOutput(output, stdoutFile, stderrFile, appendStdout, appendStderr);
    this.promptUser();
  }

  echoCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = args.join(' ');
    this.handleOutput(output, stdoutFile, stderrFile, appendStdout, appendStderr);
    this.promptUser();
  }

  typeCommand(args) {
    const cmd = args[0];
    if (!cmd) {
      console.log('Usage: type [command]');
    } else if (this.builtinCommands[cmd]) {
      console.log(`${cmd} is a shell builtin`);
    } else {
      const executablePath = this.findExecutableInPath(cmd);
      if (executablePath) {
        console.log(`${cmd} is ${executablePath}`);
      } else {
        console.log(`${cmd}: not found`);
      }
    }
    this.promptUser();
  }

  executeExternalCommand(command, args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const executablePath = this.findExecutableInPath(command);
    if (!executablePath) {
      console.log(`${command}: command not found`);
      this.promptUser();
      return;
    }

    try {
      const result = spawnSync(command, args, {
        stdio: ['inherit', stdoutFile ? 'pipe' : 'inherit', stderrFile ? 'pipe' : 'inherit']
      });

      if (result.error) {
        throw result.error;
      }

      if (stdoutFile && result.stdout) {
        this.writeToFile(stdoutFile, result.stdout, appendStdout);
      }

      if (stderrFile && result.stderr) {
        this.writeToFile(stderrFile, result.stderr, appendStderr);
      }
    } catch (error) {
      console.error(`Error executing ${command}: ${error.message}`);
    }

    this.promptUser();
  }

  parseRedirection(input) {
    const redirectionPatterns = [
      { regex: /(.*?)\s+(2>>)\s+(\S+)/, stderrFile: true, append: true },
      { regex: /(.*?)\s+(2>)\s+(\S+)/, stderrFile: true, append: false },
      { regex: /(.*?)\s+(>>|1>>)\s+(\S+)/, stdoutFile: true, append: true },
      { regex: /(.*?)\s+(>|1>)\s+(\S+)/, stdoutFile: true, append: false }
    ];

    for (const pattern of redirectionPatterns) {
      const match = input.match(pattern.regex);
      if (match) {
        return {
          command: match[1].trim(),
          stdoutFile: pattern.stdoutFile ? match[3].trim() : null,
          stderrFile: pattern.stderrFile ? match[3].trim() : null,
          appendStdout: pattern.stdoutFile && pattern.append,
          appendStderr: pattern.stderrFile && pattern.append
        };
      }
    }

    return { command: input, stdoutFile: null, stderrFile: null, appendStdout: false, appendStderr: false };
  }

  parseArguments(input) {
    const args = [];
    let currentArg = '';
    let inSingleQuotes = false;
    let inDoubleQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '\\') {
        if (i + 1 < input.length) {
          currentArg += input[++i];
        } else {
          currentArg += '\\';
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

      if (char === ' ' && !inSingleQuotes && !inDoubleQuotes) {
        if (currentArg) {
          args.push(currentArg);
          currentArg = '';
        }
        continue;
      }

      currentArg += char;
    }

    if (currentArg) {
      args.push(currentArg);
    }

    return args;
  }

  findExecutableInPath(command) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, command);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile() && (process.platform === 'win32' || (stats.mode & 0o111))) {
          return fullPath;
        }
      }
    }
    return null;
  }

  tabCompleter(line) {
    const trimmedLine = line.trim();

    if (trimmedLine === this.lastTabLine) {
      this.tabPressCount++;
    } else {
      this.tabPressCount = 1;
      this.lastTabLine = trimmedLine;
    }

    const builtins = Object.keys(this.builtinCommands);
    const builtinHits = builtins.filter(builtin => builtin.startsWith(trimmedLine));
    const pathExecutables = this.findExecutablesInPath(trimmedLine);
    const allHits = [...builtinHits, ...pathExecutables];
    const uniqueHits = [...new Set(allHits)];

    if (uniqueHits.length === 0) {
      process.stdout.write('\u0007');
      return [[], line];
    }

    if (uniqueHits.length === 1) {
      this.tabPressCount = 0;
      return [[uniqueHits[0] + ' '], line];
    }

    if (this.tabPressCount >= 2) {
      console.log();
      console.log(uniqueHits.join('  '));
      this.rl.prompt();
    }

    return [[], line];
  }

  findExecutablesInPath(prefix) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    const executables = [];

    for (const dir of pathDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(prefix)) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (stats.isFile() && (process.platform === 'win32' || (stats.mode & 0o111))) {
              executables.push(file);
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    return executables;
  }

  handleOutput(output, stdoutFile, stderrFile, appendStdout, appendStderr) {
    if (stdoutFile) {
      this.writeToFile(stdoutFile, output + '\n', appendStdout);
    } else if (stderrFile) {
      console.log(output);
      this.writeToFile(stderrFile, '', appendStderr);
    } else {
      console.log(output);
    }
  }

  writeToFile(file, content, append) {
    try {
      this.ensureDirExists(file);
      if (append) {
        fs.appendFileSync(file, content);
      } else {
        fs.writeFileSync(file, content);
      }
    } catch (error) {
      console.error(`Error writing to ${file}: ${error.message}`);
    }
  }

  ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

const shell = new SimpleShell();
shell.start();