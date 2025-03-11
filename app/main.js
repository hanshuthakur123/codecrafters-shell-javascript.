const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

class SimpleShell {
  constructor() {
    this.lastTabLine = ''; // Stores the last input line for tab completion
    this.tabPressCount = 0; // Tracks the number of consecutive tab presses

    // Built-in commands and their handlers
    this.builtinCommands = {
      'exit': this.exitCommand.bind(this),
      'cd': this.cdCommand.bind(this),
      'pwd': this.pwdCommand.bind(this),
      'echo': this.echoCommand.bind(this),
      'type': this.typeCommand.bind(this)
    };

    // Readline interface for user input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.tabCompleter.bind(this) // Tab completion handler
    });
  }

  // Start the shell
  start() {
    this.promptUser();
  }

  // Display the prompt and handle user input
  promptUser() {
    this.rl.question('$ ', (input) => {
      if (!input.trim()) {
        // If input is empty, prompt again
        this.promptUser();
        return;
      }

      // Reset tab completion state
      this.lastTabLine = '';
      this.tabPressCount = 0;

      // Execute the command
      this.executeCommand(input);
    });
  }

  // Execute the given command
  executeCommand(input) {
    // Parse redirection operators
    const { command, stdoutFile, stderrFile, appendStdout, appendStderr } = this.parseRedirection(input);

    // Parse arguments with quotes and escape sequences
    const args = this.parseArguments(command);
    if (!args.length) {
      // If no arguments, prompt again
      this.promptUser();
      return;
    }

    const cmd = args[0]; // Command name
    const cmdArgs = args.slice(1); // Command arguments

    // Check if the command is a built-in command
    if (this.builtinCommands[cmd]) {
      this.builtinCommands[cmd](cmdArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
    } else {
      // Execute external command
      this.executeExternalCommand(cmd, cmdArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
    }
  }

  // Built-in command: exit
  exitCommand(args) {
    const exitCode = args.length ? parseInt(args[0]) || 0 : 0;
    process.exit(exitCode);
  }

  // Built-in command: cd
  cdCommand(args) {
    const targetDir = args[0] || process.env.HOME; // Default to home directory
    try {
      process.chdir(path.resolve(targetDir)); // Change directory
    } catch (error) {
      console.error(`cd: ${targetDir}: No such file or directory`);
    }
    this.promptUser();
  }

  // Built-in command: pwd
  pwdCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = process.cwd(); // Get current working directory
    this.handleOutput(output, stdoutFile, stderrFile, appendStdout, appendStderr);
    this.promptUser();
  }

  // Built-in command: echo
  echoCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = args.join(' '); // Join arguments into a single string
    this.handleOutput(output, stdoutFile, stderrFile, appendStdout, appendStderr);
    this.promptUser();
  }

  // Built-in command: type
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

  // Execute an external command
  executeExternalCommand(command, args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const executablePath = this.findExecutableInPath(command);
    if (!executablePath) {
      console.log(`${command}: command not found`);
      this.promptUser();
      return;
    }

    try {
      // Configure stdio based on redirection
      const stdio = [
        'inherit', // stdin
        stdoutFile ? 'pipe' : 'inherit', // stdout
        stderrFile ? 'pipe' : 'inherit' // stderr
      ];

      // Execute the command
      const result = spawnSync(command, args, { stdio });

      if (result.error) {
        throw result.error;
      }

      // Handle stdout redirection
      if (stdoutFile && result.stdout) {
        this.writeToFile(stdoutFile, result.stdout, appendStdout);
      }

      // Handle stderr redirection
      if (stderrFile && result.stderr) {
        this.writeToFile(stderrFile, result.stderr, appendStderr);
      }
    } catch (error) {
      console.error(`Error executing ${command}: ${error.message}`);
    }

    this.promptUser();
  }

  // Parse redirection operators
  parseRedirection(input) {
    const redirectionPatterns = [
      { regex: /(.*?)\s+(2>>)\s+(\S+)/, stderrFile: true, append: true }, // stderr append (2>>)
      { regex: /(.*?)\s+(2>)\s+(\S+)/, stderrFile: true, append: false }, // stderr (2>)
      { regex: /(.*?)\s+(>>|1>>)\s+(\S+)/, stdoutFile: true, append: true }, // stdout append (>> or 1>>)
      { regex: /(.*?)\s+(>|1>)\s+(\S+)/, stdoutFile: true, append: false } // stdout (> or 1>)
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

    // No redirection
    return { command: input, stdoutFile: null, stderrFile: null, appendStdout: false, appendStderr: false };
  }

  // Parse command arguments with quotes and escape sequences
  parseArguments(input) {
    const args = [];
    let currentArg = '';
    let inSingleQuotes = false;
    let inDoubleQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      // Handle escape sequences
      if (char === '\\') {
        if (i + 1 < input.length) {
          currentArg += input[++i]; // Add the escaped character
        } else {
          currentArg += '\\'; // Add the backslash if it's the last character
        }
        continue;
      }

      // Toggle single quotes
      if (char === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
        continue;
      }

      // Toggle double quotes
      if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
        continue;
      }

      // Split arguments on spaces (outside quotes)
      if (char === ' ' && !inSingleQuotes && !inDoubleQuotes) {
        if (currentArg) {
          args.push(currentArg);
          currentArg = '';
        }
        continue;
      }

      // Add the character to the current argument
      currentArg += char;
    }

    // Add the last argument
    if (currentArg) {
      args.push(currentArg);
    }

    return args;
  }

  // Find an executable in the PATH
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

  // Tab completion handler
  tabCompleter(line) {
    const trimmedLine = line.trim();

    if (trimmedLine === this.lastTabLine) {
      this.tabPressCount++;
    } else {
      this.tabPressCount = 1;
      this.lastTabLine = trimmedLine;
    }

    // Find all possible completions
    const builtins = Object.keys(this.builtinCommands);
    const builtinHits = builtins.filter(builtin => builtin.startsWith(trimmedLine));
    const pathExecutables = this.findExecutablesInPath(trimmedLine);
    const allHits = [...builtinHits, ...pathExecutables];
    const uniqueHits = [...new Set(allHits)];

    if (uniqueHits.length === 0) {
      // No matches: ring the bell
      process.stdout.write('\u0007'); // Bell character
      return [[], line]; // Return the original line unchanged
    }

    if (uniqueHits.length === 1) {
      // Single match: complete the command and add a space
      this.tabPressCount = 0; // Reset counter after completion
      return [[uniqueHits[0] + ' '], line]; // Add a space after the completed command
    }

    if (this.tabPressCount >= 2) {
      // Multiple matches: display all matching executables
      console.log(); // Move to new line
      console.log(uniqueHits.join('  ')); // Show matches separated by two spaces
      this.rl.prompt(); // Return to prompt with the current line
    }

    // Don't change the input line after displaying completions
    return [[], line];
  }

  // Find executables in the PATH that match the prefix
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

  // Handle output redirection
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

  // Write content to a file
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

  // Ensure the directory exists
  ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Create and start the shell
const shell = new SimpleShell();
shell.start();