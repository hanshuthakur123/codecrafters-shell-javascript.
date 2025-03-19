const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Class-based approach for better organization
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

  // Start the shell
  start() {
    this.promptUser();
  }

  // Display prompt and handle input
  promptUser() {
    this.rl.question('$ ', (input) => {
      if (!input.trim()) {
        this.promptUser();
        return;
      }
      
      // Reset tab completion state
      this.lastTabLine = '';
      this.tabPressCount = 0;
      
      this.executeCommand(input);
    });
  }

  // Main command execution logic
  executeCommand(input) {
    // Parse redirection first
    const { 
      command: fullCommand, 
      stdoutFile, 
      stderrFile, 
      appendStdout, 
      appendStderr 
    } = this.parseRedirection(input);
    
    // Parse arguments with quotes and escapes
    const args = this.parseArguments(fullCommand);
    if (!args.length) {
      this.promptUser();
      return;
    }
    
    const command = args[0];
    const commandArgs = args.slice(1);
    
    // Check if this is a builtin command
    if (this.builtinCommands[command]) {
      this.builtinCommands[command](commandArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
      return;
    }
    
    // Handle external command
    this.executeExternalCommand(command, commandArgs, stdoutFile, stderrFile, appendStdout, appendStderr);
  }

  // BUILT-IN COMMANDS
  
  exitCommand(args) {
    if (args.length === 0 || args[0] === '0') {
      process.exit(0);
      return;
    }
    
    const exitCode = parseInt(args[0]);
    if (!isNaN(exitCode)) {
      process.exit(exitCode);
    } else {
      console.error('exit: numeric argument required');
      this.promptUser();
    }
  }
  
  cdCommand(args) {
    const targetDir = args[0];
    if (!targetDir) {
      console.log('cd: missing argument');
    } else {
      let newPath;
      if (targetDir === '~') {
        newPath = process.env.HOME;
      } else {
        newPath = path.resolve(targetDir);
      }
      
      try {
        process.chdir(newPath);
      } catch (error) {
        console.log(`cd: ${targetDir}: No such file or directory`);
      }
    }
    this.promptUser();
  }
  
  pwdCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = process.cwd();
    
    if (stdoutFile) {
      this.writeToFile(stdoutFile, output + '\n', appendStdout);
    } else if (stderrFile) {
      console.log(output);
      this.writeToFile(stderrFile, '', appendStderr);
    } else {
      console.log(output);
    }
    
    this.promptUser();
  }
  
  echoCommand(args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const output = args.join(' ');
    
    if (stdoutFile) {
      this.writeToFile(stdoutFile, output + '\n', appendStdout);
    } else if (stderrFile) {
      console.log(output);
      this.writeToFile(stderrFile, '', appendStderr);
    } else {
      console.log(output);
    }
    
    this.promptUser();
  }
  
  typeCommand(args) {
    const cmd = args[0];
    
    if (!cmd) {
      console.log('Usage: type [command]');
    } else if (Object.keys(this.builtinCommands).includes(cmd)) {
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
    
    this.promptUser();
  }
  
  // EXTERNAL COMMAND EXECUTION
  
  executeExternalCommand(command, args, stdoutFile, stderrFile, appendStdout, appendStderr) {
    const paths = process.env.PATH.split(path.delimiter);
    let found = false;
    
    for (const dir of paths) {
      const fullPath = path.join(dir, command);
      
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        found = true;
        
        try {
          // Configure stdio based on redirection
          let stdio;
          if (stdoutFile && stderrFile) {
            stdio = ['inherit', 'pipe', 'pipe']; // Both stdout and stderr are piped
          } else if (stdoutFile) {
            stdio = ['inherit', 'pipe', 'inherit']; // Only stdout is piped
          } else if (stderrFile) {
            stdio = ['inherit', 'inherit', 'pipe']; // Only stderr is piped
          } else {
            stdio = 'inherit'; // No redirection
          }
          
          // Execute the command
          const result = spawnSync(command, args, { stdio });
          
          if (result.error) {
            throw result.error;
          }
          
          // Handle stdout redirection if needed
          if (stdoutFile && result.stdout) {
            this.writeToFile(stdoutFile, result.stdout, appendStdout);
          }
          
          // Handle stderr redirection if needed
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
      console.log(`${command}: command not found`);
    }
    
    this.promptUser();
  }
  
  // HELPER FUNCTIONS
  
  // Parse command line with redirection operators
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
  
  // Parse command arguments with quotes and escape sequences
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
          
          // In double quotes, only certain characters get escaped
          if (inDoubleQuotes) {
            if (nextChar === '"' || nextChar === '\\' || nextChar === '$') {
              i++; // Skip the backslash
              currentArg += nextChar;
            } else {
              // Preserve the backslash for other characters in double quotes
              currentArg += "\\";
            }
          }
          // In single quotes, no escaping happens, treat backslash as literal
          else if (inSingleQuotes) {
            currentArg += "\\";
          }
          // Outside quotes, backslash escapes the next character
          else {
            i++; // Skip the backslash
            // Handle space specially if escaped outside quotes
            if (nextChar === ' ') {
              currentArg += ' ';
            } else {
              // For other characters, preserve the literal character
              currentArg += nextChar;
            }
          }
        }
        continue;
      }
      
      // Toggle single quote state when encountering unescaped single quote
      if (char === "'" && !inDoubleQuotes) {
        inSingleQuotes = !inSingleQuotes;
        continue;
      }
      
      // Toggle double quote state when encountering unescaped double quote
      if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
        continue;
      }
      
      // Split arguments based on spaces, but only when outside of quotes
      if (char === " " && !inSingleQuotes && !inDoubleQuotes) {
        if (currentArg) {
          args.push(currentArg);
          currentArg = "";
        }
        continue;
      }
      
      // Add the character to the current argument
      currentArg += char;
    }
    
    // Add any remaining argument
    if (currentArg) {
      args.push(currentArg);
    }
    
    return args;
  }
  
  // Find executables in PATH for tab completion
  findExecutablesInPath(prefix) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    const executables = [];
    
    for (const dir of pathDirs) {
      try {
        // Skip if directory doesn't exist
        if (!fs.existsSync(dir)) continue;
        
        // Read all files in the directory
        const files = fs.readdirSync(dir);
        
        // Filter files that start with the prefix and are executable
        for (const file of files) {
          if (file.startsWith(prefix)) {
            try {
              const filePath = path.join(dir, file);
              const stats = fs.statSync(filePath);
              
              // On Unix-like systems, check if the file is executable by the current user
              // On Windows, check if it's a file (Windows doesn't have executable permissions)
              const isExecutable = process.platform === 'win32' 
                ? stats.isFile() 
                : stats.isFile() && (stats.mode & 0o111); // Check for executable bit
                
              if (isExecutable) {
                executables.push(file);
              }
            } catch (error) {
              // Skip files that can't be accessed
              continue;
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
        continue;
      }
    }
    
    return executables;
  }
  
  // Tab completion handler
  tabCompleter(line) {
    // List of built-in commands for autocompletion
    const builtins = Object.keys(this.builtinCommands);
    
    // Trim any leading/trailing whitespace
    const trimmedLine = line.trim();
    
    // Check if this is a repeated tab press
    if (trimmedLine === this.lastTabLine) {
      this.tabPressCount++;
    } else {
      // Reset counter for new input
      this.tabPressCount = 1;
      this.lastTabLine = trimmedLine;
    }
    
    // If the line is empty, return all builtins
    if (trimmedLine === '') {
      return [builtins, line];
    }
    
    // Filter builtin commands that start with the current input
    const builtinHits = builtins.filter((builtin) => 
      builtin.startsWith(trimmedLine)
    );
    
    // Find executables in PATH that start with the current input
    const pathExecutables = this.findExecutablesInPath(trimmedLine);
    
    // Combine builtin and executable matches
    const allHits = [...builtinHits, ...pathExecutables];
    
    // Remove duplicates (in case an executable has the same name as a builtin)
    const uniqueHits = [...new Set(allHits)];
    
    // If there are no matches, ring the bell
    if (uniqueHits.length === 0) {
      // Ring the bell - try multiple methods to ensure it works
      console.log('\u0007'); // Unicode bell character
      process.stdout.write('\u0007'); // Alternative method
      
      return [[], line]; // Return the original line unchanged
    }
    
    // If there's exactly one match, return it plus a space
    if (uniqueHits.length === 1) {
      this.tabPressCount = 0; // Reset counter after completion
      return [[uniqueHits[0] + ' '], line]; // Add a space after the completed command
    } else {
      // Multiple matches
      if (this.tabPressCount === 1) {
        // First tab press: only ring the bell
        process.stdout.write('\u0007'); // Bell character
        return [[], line]; // Don't change the line
      } else if (this.tabPressCount >= 2) {
        // Second tab press: display all matching executables
        console.log(); // Move to new line
        console.log(uniqueHits.join('  ')); // Show matches separated by two spaces
        this.rl.prompt(); // Return to prompt with the current line
        
        // Don't change the input line after displaying completions
        return [[], line];
      }
      return [[], line]; // Default case, don't change the line
    }
  }
  
  // File operation helpers
  ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
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
      return true;
    } catch (error) {
      console.error(`Error writing to ${file}: ${error.message}`);
      return false;
    }
  }
}

// Create and start the shell
const shell = new SimpleShell();
shell.start();
