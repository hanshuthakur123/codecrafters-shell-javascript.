const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/**
 * Shell class with command handling and tab completion
 */
class Shell {
  constructor() {
    this.lastTabLine = '';
    this.tabPressCount = 0;
    this.builtins = {
      'echo': this.echoCommand.bind(this),
      'exit': this.exitCommand.bind(this),
      'cd': this.cdCommand.bind(this),
      'pwd': this.pwdCommand.bind(this),
      'type': this.typeCommand.bind(this)
    };
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.tabCompleter.bind(this)
    });
  }

  /**
   * Start the shell prompt
   */
  start() {
    this.prompt();
  }

  /**
   * Display the prompt and handle input
   */
  prompt() {
    this.rl.question("$ ", (input) => {
      if (!input.trim()) {
        return this.prompt();
      }
      
      // Reset tab press state on command execution
      this.lastTabLine = '';
      this.tabPressCount = 0;
      
      this.executeCommand(input);
    });
  }

  /**
   * Execute the provided command
   * @param {string} input - The command to execute
   */
  executeCommand(input) {
    // Parse redirection options
    const { command, stdoutFile, stderrFile, appendStdout, appendStderr } = this.parseRedirection(input);
    
    // Parse the command into command and arguments
    const args = this.parseArguments(command);
    if (!args.length) {
      return this.prompt();
    }
    
    const cmdName = args[0];
    const cmdArgs = args.slice(1);
    
    // Check if it's a builtin command
    if (this.builtins[cmdName]) {
      this.builtins[cmdName](cmdArgs, { stdoutFile, stderrFile, appendStdout, appendStderr });
      return;
    }
    
    // External command
    this.executeExternalCommand(cmdName, cmdArgs, { stdoutFile, stderrFile, appendStdout, appendStderr });
  }

  /**
   * Tab completion function
   * @param {string} line - Current command line
   * @returns {Array} - Completions and original line
   */
  tabCompleter(line) {
    // Trim the line
    const trimmedLine = line.trim();
    
    // Check if this is a repeated tab press
    if (trimmedLine === this.lastTabLine) {
      this.tabPressCount++;
    } else {
      this.tabPressCount = 1;
      this.lastTabLine = trimmedLine;
    }
    
    // If the line is empty, return all builtins
    if (trimmedLine === '') {
      return [Object.keys(this.builtins), line];
    }
    
    // Filter builtin commands that start with the current input
    const builtinHits = Object.keys(this.builtins).filter(builtin => 
      builtin.startsWith(trimmedLine)
    );
    
    // Find executables in PATH that start with the current input
    const pathExecutables = this.findExecutablesInPath(trimmedLine);
    
    // Combine matches and remove duplicates
    const uniqueHits = [...new Set([...builtinHits, ...pathExecutables])];
    
    // No matches
    if (uniqueHits.length === 0) {
      this.ringBell();
      return [[], line];
    }
    
    // Exactly one match
    if (uniqueHits.length === 1) {
      this.tabPressCount = 0;
      return [[uniqueHits[0] + ' '], line];
    } 
    
    // Multiple matches
    if (this.tabPressCount === 1) {
      // First tab press: ring the bell
      this.ringBell();
      return [[], line];
    } else if (this.tabPressCount >= 2) {
      // Second tab press: display all matching executables
      console.log();
      console.log(uniqueHits.join('  '));
      process.stdout.write(`$ ${line}`); // Rewrite the prompt with the current line
      return [[], line]; // Don't change the line
    }
    
    return [[], line];
  }

  /**
   * Find executable files in PATH
   * @param {string} prefix - Command prefix to search for
   * @returns {Array} - List of matching executables
   */
  findExecutablesInPath(prefix) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    const executables = [];
    
    for (const dir of pathDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          if (file.startsWith(prefix)) {
            try {
              const filePath = path.join(dir, file);
              const stats = fs.statSync(filePath);
              
              const isExecutable = process.platform === 'win32'
                ? stats.isFile()
                : stats.isFile() && (stats.mode & 0o111);
                
              if (isExecutable) {
                executables.push(file);
              }
            } catch (error) {
              continue;
            }
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return executables;
  }

  /**
   * Parse redirection options from a command string
   * @param {string} input - Command string
   * @returns {Object} - Command and redirection options
   */
  parseRedirection(input) {
    // Check for stderr append redirection (2>>)
    const stderrAppendMatch = input.match(/(.*?)(?:\s+)(2>>)(?:\s+)(\S+)/);
    if (stderrAppendMatch) {
      return {
        command: stderrAppendMatch[1].trim(),
        stderrFile: stderrAppendMatch[3].trim(),
        stdoutFile: null,
        appendStdout: false,
        appendStderr: true
      };
    }
    
    // Check for stderr redirection (2>)
    const stderrMatch = input.match(/(.*?)(?:\s+)(2>)(?:\s+)(\S+)/);
    if (stderrMatch) {
      return {
        command: stderrMatch[1].trim(),
        stderrFile: stderrMatch[3].trim(),
        stdoutFile: null,
        appendStdout: false,
        appendStderr: false
      };
    }
    
    // Check for stdout append redirection (>> or 1>>)
    const stdoutAppendMatch = input.match(/(.*?)(?:\s+)(>>|1>>)(?:\s+)(\S+)/);
    if (stdoutAppendMatch) {
      return {
        command: stdoutAppendMatch[1].trim(),
        stdoutFile: stdoutAppendMatch[3].trim(),
        stderrFile: null,
        appendStdout: true,
        appendStderr: false
      };
    }
    
    // Check for stdout redirection (> or 1>)
    const stdoutMatch = input.match(/(.*?)(?:\s+)(>|1>)(?:\s+)(\S+)/);
    if (stdoutMatch) {
      return {
        command: stdoutMatch[1].trim(),
        stdoutFile: stdoutMatch[3].trim(),
        stderrFile: null,
        appendStdout: false,
        appendStderr: false
      };
    }
    
    // No redirection
    return { 
      command: input, 
      stdoutFile: null,
      stderrFile: null,
      appendStdout: false,
      appendStderr: false
    };
  }

  /**
   * Parse command arguments with proper quote handling
   * @param {string} input - Command string
   * @returns {Array} - Array of arguments
   */
  parseArguments(input) {
    const args = [];
    let currentArg = "";
    let inSingleQuotes = false;
    let inDoubleQuotes = false;
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      
      // Handle backslash escape sequences
      if (char === "\\") {
        // Check if we're at the end of the string
        if (i + 1 >= input.length) {
          currentArg += "\\";
        } else {
          const nextChar = input[i + 1];
          
          // Handle escaping differently depending on quote context
          if (inDoubleQuotes) {
            if (nextChar === '"' || nextChar === '\\' || nextChar === '$') {
              i++; // Skip the backslash
              currentArg += nextChar;
            } else {
              currentArg += "\\";
            }
          } else if (inSingleQuotes) {
            currentArg += "\\";
          } else {
            i++; // Skip the backslash
            if (nextChar === ' ') {
              currentArg += ' ';
            } else {
              currentArg += nextChar;
            }
          }
        }
        continue;
      }
      
      // Toggle quote states
      if (char === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
        continue;
      }
      
      if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
        continue;
      }
      
      // Split arguments on spaces outside quotes
      if (char === " " && !inSingleQuotes && !inDoubleQuotes) {
        if (currentArg) {
          args.push(currentArg);
          currentArg = "";
        }
        continue;
      }
      
      // Add character to current argument
      currentArg += char;
    }
    
    // Add final argument if there is one
    if (currentArg) {
      args.push(currentArg);
    }
    
    return args;
  }

  /**
   * Execute an external command
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @param {Object} options - Redirection options
   */
  executeExternalCommand(command, args, { stdoutFile, stderrFile, appendStdout, appendStderr }) {
    const paths = process.env.PATH.split(path.delimiter);
    let found = false;
    
    for (const dir of paths) {
      const fullPath = path.join(dir, command);
      
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        found = true;
        
        try {
          // Configure stdio based on redirection needs
          let stdio;
          if (stdoutFile && stderrFile) {
            stdio = ['inherit', 'pipe', 'pipe'];
          } else if (stdoutFile) {
            stdio = ['inherit', 'pipe', 'inherit'];
          } else if (stderrFile) {
            stdio = ['inherit', 'inherit', 'pipe'];
          } else {
            stdio = 'inherit';
          }
          
          // Execute the command
          const result = spawnSync(command, args, { stdio });
          
          if (result.error) {
            throw result.error;
          }
          
          // Handle redirections
          if (stdoutFile && result.stdout) {
            this.writeToFile(stdoutFile, result.stdout, appendStdout);
          }
          
          if (stderrFile && result.stderr) {
            this.writeToFile(stderrFile, result.stderr, appendStderr);
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
    
    this.prompt();
  }

  /**
   * Write content to a file
   * @param {string} file - Path to file
   * @param {string|Buffer} content - Content to write
   * @param {boolean} append - Whether to append or overwrite
   * @returns {boolean} - Success status
   */
  writeToFile(file, content, append) {
    try {
      this.ensureDirExists(file);
      
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

  /**
   * Ensure a directory exists for a file path
   * @param {string} filePath - Path to file
   */
  ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Ring the terminal bell
   */
  ringBell() {
    console.log('\u0007');
    process.stdout.write('\u0007');
  }

  /**
   * Handle output with redirection
   * @param {string} output - Output content
   * @param {Object} options - Redirection options
   */
  handleOutput(output, { stdoutFile, stderrFile, appendStdout, appendStderr }) {
    if (stdoutFile) {
      this.writeToFile(stdoutFile, output + "\n", appendStdout);
    } else if (stderrFile) {
      console.log(output);
      this.writeToFile(stderrFile, "", appendStderr);
    } else {
      console.log(output);
    }
    
    this.prompt();
  }

  /**
   * Builtin: echo command
   * @param {Array} args - Command arguments
   * @param {Object} options - Redirection options
   */
  echoCommand(args, options) {
    const output = args.join(" ");
    this.handleOutput(output, options);
  }

  /**
   * Builtin: exit command
   * @param {Array} args - Command arguments
   */
  exitCommand(args) {
    if (args.length === 0 || args[0] === "0") {
      process.exit(0);
      return;
    }
    
    const exitCode = parseInt(args[0]);
    
    if (!isNaN(exitCode)) {
      process.exit(exitCode);
    } else {
      console.error("exit: numeric argument required");
      this.prompt();
    }
  }

  /**
   * Builtin: cd command
   * @param {Array} args - Command arguments
   */
  cdCommand(args) {
    const targetDir = args[0];
    
    if (!targetDir) {
      console.error("cd: missing argument");
    } else {
      let newPath;
      
      if (targetDir === "~") {
        newPath = process.env.HOME;
      } else {
        newPath = path.resolve(targetDir);
      }
      
      try {
        process.chdir(newPath);
      } catch (error) {
        console.error(`cd: ${targetDir}: No such file or directory`);
      }
    }
    
    this.prompt();
  }

  /**
   * Builtin: pwd command
   * @param {Array} args - Command arguments
   * @param {Object} options - Redirection options
   */
  pwdCommand(args, options) {
    const output = process.cwd();
    this.handleOutput(output, options);
  }

  /**
   * Builtin: type command
   * @param {Array} args - Command arguments
   */
  typeCommand(args) {
    const cmd = args[0];
    
    if (!cmd) {
      console.log("Usage: type [command]");
    } else if (Object.keys(this.builtins).includes(cmd)) {
      console.log(`${cmd} is a shell builtin`);
    } else {
      // Check in PATH directories
      const paths = process.env.PATH.split(path.delimiter);
      let found = false;
      
      for (const dir of paths) {
        const fullPath = path.join(dir, cmd);
        
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          console.log(`${cmd} is ${fullPath}`);
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.log(`${cmd}: not found`);
      }
    }
    
    this.prompt();
  }
}

// Create and start shell
const shell = new Shell();
shell.start();