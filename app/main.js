const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
// Function to find executable files in PATH
function findExecutablesInPath(prefix) {
  // Get all directories in PATH
  const pathDirs = process.env.PATH.split(path.delimiter);
  
  // Collect all matching executables
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
          // Check if the file is executable
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
// Track tab press state
let lastTabLine = '';
let tabPressCount = 0;
// Custom readline interface with tab completion
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: function(line) {
    // List of built-in commands for autocompletion
    const builtins = ['echo', 'exit', 'cd', 'pwd', 'type'];
    
    // Trim any leading/trailing whitespace
    const trimmedLine = line.trim();
    
    // Check if this is a repeated tab press
    if (trimmedLine === lastTabLine) {
      tabPressCount++;
    } else {
      // Reset counter for new input
      tabPressCount = 1;
      lastTabLine = trimmedLine;
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
    const pathExecutables = findExecutablesInPath(trimmedLine);
    
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
      tabPressCount = 0; // Reset counter after completion
      return [[uniqueHits[0] + ' '], line]; // Add a space after the completed command
    } else {
      // Multiple matches
      if (tabPressCount === 1) {
        // First tab press: only ring the bell
        process.stdout.write('\u0007'); // Bell character
        return [[], line]; // Don't change the line
      } else if (tabPressCount >= 2) {
        // Second tab press: display all matching executables
        console.log(); // Move to new line
        console.log(uniqueHits.join('  ')); // Show matches separated by two spaces
        rl.prompt(); // Return to prompt with the current line
        
        // Don't change the input line after displaying completions
        return [[], line];
      }
      return [[], line]; // Default case, don't change the line
    }
  }
});
function parseRedirection(input) {
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
function parseArguments(input) {
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
        // Add the backslash if it's the last character
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
// Helper function to ensure a directory exists
function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
// Helper function to write to file (with append support)
function writeToFile(file, content, append) {
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
function prompt() {
  rl.question("$ ", (answer) => {
    if (!answer.trim()) {
      prompt();
      return;
    }
    // Reset tab press state on command execution
    lastTabLine = '';
    tabPressCount = 0;
    // Check for redirection
    const { command: fullCommand, stdoutFile, stderrFile, appendStdout, appendStderr } = parseRedirection(answer);
    
    // Parse the command into command and arguments
    const args = parseArguments(fullCommand);
    const command = args[0];
    const commandArgs = args.slice(1);
    if (command === "exit") {
      // Handle exit command with or without args
      if (commandArgs.length === 0 || commandArgs[0] === "0") {
        process.exit(0);
        return;
      }
      const exitCode = parseInt(commandArgs[0]);
      if (!isNaN(exitCode)) {
        process.exit(exitCode);
      } else {
        console.error(`exit: numeric argument required`);
        prompt();
      }
      return;
    }
    
    if (command === "cd") {
      const targetDir = commandArgs[0];
      if (!targetDir) {
        console.log("cd: missing argument");
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
          console.log(`cd: ${targetDir}: No such file or directory`);
        }
      }
      prompt();
      return;
    }
    
    if (command === "type") {
      let cmd = commandArgs[0];
      if (!cmd) {
        console.log("Usage: type [command]");
      } else if (["exit", "echo", "type", "pwd"].includes(cmd)) {
        console.log(`${cmd} is a shell builtin`);
      } else {
        // Check in PATH directories
        const paths = process.env.PATH.split(path.delimiter);
        let found = false;
        for (let dir of paths) {
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
      prompt();
      return;
    }
    
    if (command === "echo") {
      const output = commandArgs.join(" ");
      
      // Handle stdout redirection
      if (stdoutFile) {
        writeToFile(stdoutFile, output + "\n", appendStdout);
      } else if (stderrFile) {
        // For echo, if only stderr is redirected, stdout still goes to console
        console.log(output);
        // Since echo doesn't typically generate stderr, we create an empty file
        writeToFile(stderrFile, "", appendStderr);
      } else {
        console.log(output);
      }
      
      prompt();
      return;
    }
    
    if (command === "pwd") {
      const output = process.cwd();
      
      // Handle stdout redirection
      if (stdoutFile) {
        writeToFile(stdoutFile, output + "\n", appendStdout);
      } else if (stderrFile) {
        // For pwd, if only stderr is redirected, stdout still goes to console
        console.log(output);
        // Since pwd doesn't typically generate stderr, we create an empty file
        writeToFile(stderrFile, "", appendStderr);
      } else {
        console.log(output);
      }
      
      prompt();
      return;
    }
    
    // External command
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
            stdio = ['inherit', 'pipe', 'pipe']; // Both stdout and stderr are piped
          } else if (stdoutFile) {
            stdio = ['inherit', 'pipe', 'inherit']; // Only stdout is piped
          } else if (stderrFile) {
            stdio = ['inherit', 'inherit', 'pipe']; // Only stderr is piped
          } else {
            stdio = 'inherit'; // No redirection
          }
          // Execute the command
          const result = spawnSync(command, commandArgs, { stdio });
          
          if (result.error) {
            throw result.error;
          }
          
          // Handle stdout redirection if needed
          if (stdoutFile && result.stdout) {
            writeToFile(stdoutFile, result.stdout, appendStdout);
          }
          
          // Handle stderr redirection if needed
          if (stderrFile && result.stderr) {
            writeToFile(stderrFile, result.stderr, appendStderr);
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
    prompt(); // Keep the shell running
  });
}

prompt();