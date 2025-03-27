

const execSync = require("child_process").execSync;
const readline = require("readline");
const fs = require('node:fs');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer
});
const PATH = process.env.PATH;
const splitCurrDir = __dirname.split("/");
let currWorkDir = `/${splitCurrDir[splitCurrDir.length - 1]}`;

function checkIfCommandExistsInPath(builtin) {
  const paths = PATH.split(":");
  for (let path of paths) {
    if (!fs.existsSync(path)) {
      continue;
    }
    const fileNames = fs.readdirSync(path);
    if (fileNames.includes(builtin)) {
      console.log(`${builtin} is ${path}/${builtin}`);
      return true;
    }
  }
  return false;
}
function handleEcho(text) {
  const parts = text.trim().split(" ");
  const stderrOverwriteIndex = parts.indexOf("2>");
  const stderrAppendIndex = parts.indexOf("2>>");
  const stdoutAppendIndex = parts.indexOf("1>>");
  const stdoutOverwriteIndex = parts.indexOf(">");
  const stdoutExplicitOverwriteIndex = parts.indexOf("1>");
  
  // Handle stdout explicit overwrite redirection (1>)
  if (stdoutExplicitOverwriteIndex !== -1 && stdoutExplicitOverwriteIndex < parts.length - 1) {
    const redirectFile = parts.slice(stdoutExplicitOverwriteIndex + 1).join(" ");
    const echoText = parts.slice(0, stdoutExplicitOverwriteIndex).join(" ");
    
    // Ensure directory exists
    const dir = redirectFile.substring(0, redirectFile.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Handle quoted and unquoted output correctly
    let output;
    if (echoText.startsWith('"') && echoText.endsWith('"')) {
      output = echoText.slice(1, -1);
    } else if (echoText.startsWith("'") && echoText.endsWith("'")) {
      output = echoText.slice(1, -1).replaceAll("'", "");
    } else {
      output = echoText;
    }
    
    // Overwrite file with output
    fs.writeFileSync(redirectFile, output + "\n");
    return;
  }
  
  // Handle stderr overwrite redirection (2>)
  if (stderrOverwriteIndex !== -1 && stderrOverwriteIndex < parts.length - 1) {
    const redirectFile = parts.slice(stderrOverwriteIndex + 1).join(" ");
    const echoText = parts.slice(0, stderrOverwriteIndex).join(" ");
    
    const dir = redirectFile.substring(0, redirectFile.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let output;
    if (echoText.startsWith('"') && echoText.endsWith('"')) {
      output = echoText.slice(1, -1);
    } else if (echoText.startsWith("'") && echoText.endsWith("'")) {
      output = echoText.slice(1, -1).replaceAll("'", "");
    } else {
      output = echoText;
    }
    
    fs.writeFileSync(redirectFile, ""); // Echo has no stderr
    console.log(output);
    return;
  }
  
  // Handle stdout overwrite redirection (>)
  if (stdoutOverwriteIndex !== -1 && stdoutOverwriteIndex < parts.length - 1) {
    const redirectFile = parts.slice(stdoutOverwriteIndex + 1).join(" ");
    const echoText = parts.slice(0, stdoutOverwriteIndex).join(" ");
    
    const dir = redirectFile.substring(0, redirectFile.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let output;
    if (echoText.startsWith('"') && echoText.endsWith('"')) {
      output = echoText.slice(1, -1);
    } else if (echoText.startsWith("'") && echoText.endsWith("'")) {
      output = echoText.slice(1, -1).replaceAll("'", "");
    } else {
      output = echoText;
    }
    
    fs.writeFileSync(redirectFile, output + "\n");
    return;
  }
  
  // Handle stdout append redirection (1>>)
  if (stdoutAppendIndex !== -1 && stdoutAppendIndex < parts.length - 1) {
    const redirectFile = parts.slice(stdoutAppendIndex + 1).join(" ");
    const echoText = parts.slice(0, stdoutAppendIndex).join(" ");
    
    const dir = redirectFile.substring(0, redirectFile.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let output;
    if (echoText.startsWith('"') && echoText.endsWith('"')) {
      output = echoText.slice(1, -1);
    } else if (echoText.startsWith("'") && echoText.endsWith("'")) {
      output = echoText.slice(1, -1).replaceAll("'", "");
    } else {
      output = echoText;
    }
    
    fs.appendFileSync(redirectFile, output + "\n");
    return;
  }
  
  // Handle stderr append redirection (2>>)
  if (stderrAppendIndex !== -1 && stderrAppendIndex < parts.length - 1) {
    const redirectFile = parts.slice(stderrAppendIndex + 1).join(" ");
    const echoText = parts.slice(0, stderrAppendIndex).join(" ");
    
    const dir = redirectFile.substring(0, redirectFile.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let output;
    if (echoText.startsWith('"') && echoText.endsWith('"')) {
      output = echoText.slice(1, -1);
    } else if (echoText.startsWith("'") && echoText.endsWith("'")) {
      output = echoText.slice(1, -1).replaceAll("'", "");
    } else {
      output = echoText;
    }
    console.log(output); // Echo has no stderr
    return;
  }

  // Original echo handling without redirection
  if (text.startsWith("'") && text.endsWith("'")) {
    const formattedString = text.slice(1, text.length - 1);
    console.log(formattedString.replaceAll("'", ""));
    return;
  }
  const formattedString = text.split(" ").filter(t => t !== "").join(" ");
  console.log(formattedString);
}
function handleChangeDirectory(answer) {
  let path = answer.split(" ")[1];
  if (path === "~") {
    currWorkDir = process.env.HOME;
    return;
  }
  let newWorkDir = "";
  if (!path.startsWith(".")) {
    path = path.slice(1);
  } else {
    newWorkDir = currWorkDir;
  }
  if (path.endsWith("/")) {
    path = path.slice(0, path.length - 1);
  }
  const steps = path.split("/");
  for (let step of steps) {
    switch (step) {
      case ".":
        break;
      case "..":
        const splitNewWorkDir = newWorkDir.split("/");
        newWorkDir = splitNewWorkDir.slice(0, splitNewWorkDir.length - 1).join("/");
        break;
      default:
        newWorkDir += `/${step}`;
    }
    if (!fs.existsSync(newWorkDir)) {
      console.log(`cd: ${answer.split(" ")[1]}: No such file or directory`);
      return;
    }
  }
  currWorkDir = newWorkDir;
}

function handledExternalProgram(answer) {
  const paths = PATH.split(":");
  let foundPath = "";
  const parts = answer.split(" ");
  const program = parts[0];
  
  for (let path of paths) {
    if (!fs.existsSync(path)) {
      continue;
    }
    const fileNames = fs.readdirSync(path);
    if (fileNames.includes(program)) {
      foundPath = path;
      break;
    }
  }

  if (foundPath === "") {
    return false;
  }

  try {
    const result = require("child_process").spawnSync(
      answer,  // Pass the full command including redirection
      [],
      {
        shell: true,
        stdio: ['pipe', 'inherit', 'inherit'] // Let shell handle all redirections
      }
    );

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    if (error.stderr) {
      console.log(error.stderr.toString().trim());
    }
    return true;
  }
}
// Updated handleAnswer to ensure proper routing
function handleAnswer(answer) {
  if (answer === "exit 0") {
    rl.close();
    return;
  }
  if (answer.startsWith("echo ")) {
    const text = answer.replace("echo ", "");
    handleEcho(text);
  } else if (answer.startsWith("type ")) {
    const builtin = answer.replace("type ", "");
    let found = false;
    switch (builtin) {
      case "echo":
      case "type":
      case "exit":
      case "pwd":
      case "cd":
        console.log(`${builtin} is a shell builtin`);
        found = true;
        break;
      default:
        found = checkIfCommandExistsInPath(builtin);
        break;
    }
    if (!found) {
      console.log(`${builtin}: not found`);
    }
  } else if (answer === "pwd") {
    console.log(currWorkDir);
  } else if (answer.startsWith("cd ")) {
    handleChangeDirectory(answer);
  } else if (!handledExternalProgram(answer)) {
    console.log(`${answer}: command not found`);
  }
  repeat();
}

function repeat() {
  rl.question("$ ", (answer) => {
    handleAnswer(answer);
  });
}

// Find the longest common prefix of an array of strings
function findCommonPrefix(strings) {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];
  
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    // Find common prefix between current prefix and next string
    let j = 0;
    while (j < prefix.length && j < strings[i].length && prefix[j] === strings[i][j]) {
      j++;
    }
    prefix = prefix.substring(0, j);
    if (prefix === '') break;
  }
  
  return prefix;
}

function completer(line) {
  const allCommands = getMatchingCommands(line);
  // Use Set to remove duplicates
  const uniqueCommands = [...new Set(['echo', 'type', 'exit', 'pwd', 'cd', ...allCommands])]; // Added built-ins
  const hits = uniqueCommands.filter((c) => c.startsWith(line))
  .sort();
  
  if (hits.length === 0) {
    // No matches, return nothing
    process.stdout.write('\x07');
    return [[] , line];
    
  }

 
  if (hits.length === 1  && hits[0] === line) {
    // If there's only one match, append a space after the autocompleted command
    return [[hits[0]], line];
  }
  if (hits.length === 1) {
    // If there's only one match, append a space after the autocompleted command
    return [[hits[0]+' '], line];
  }
  // Find the common prefix among all matches
  const commonPrefix = findCommonPrefix(hits);
  
  // If we can complete more than what's already typed
  if (commonPrefix.length > line.length) {
    return [[commonPrefix], line];
  }
  
  // Otherwise, show all options
  console.log(); // Move to a new line
  console.log(hits.join('  ')); // Display all options with double spaces between them
  
  // Ring the bell
  process.stdout.write('\x07');
  
  // Redisplay the prompt with the current input
  rl.write(null, {ctrl: true, name: 'u'}); // Clear the line
  rl.write(`${line}`); // Rewrite the prompt and current input
 
  // Return empty array to prevent readline from modifying the prompt
  return [[], line];
}

function getMatchingCommands(line) {
  const paths = PATH.split(":");
  let commands = [];
  for (let path of paths) {
    if (!fs.existsSync(path)) {
      continue;
    }
    const fileNames = fs.readdirSync(path);
    commands = commands.concat(fileNames);
  }
  return commands;
}

repeat();