const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { exit } = require("process");
const { execFileSync } = require("node:child_process");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const typeBuiltIn = ["echo", "exit", "type", "pwd", "cd"];
const currDirParts = __dirname.split("/");
let currWorkDir = `/${currDirParts[currDirParts.length - 1]}`;
function prompt() {
  rl.question("$ ", (answer) => {
    const parts = answer.split(" ");
    if (answer === "exit 0") {
      exit(0);
    } else if (parts[0] === "echo") {
      console.log(parts.slice(1).join(" "));
    } else if (parts[0] === "type") {
      if (typeBuiltIn.includes(parts[1])) {
        console.log(`${parts[1]} is a shell builtin`);
      } else {
        typePathCommands(parts.slice(1).join(" "));
      }
    } else if (parts[0] === "pwd") {
      console.log(currWorkDir);
    } else if (parts[0] === "cd") {
      absolutePath(answer);
    } else {
      execCommands(answer);
    }
    prompt(); // Recursive prompt call
  });
}
function typePathCommands(command) {
  let found = false;
  const paths = process.env.PATH.split(path.delimiter);
  for (let p of paths) {
    const fullpath = path.join(p, command);
    if (fs.existsSync(fullpath) && fs.statSync(fullpath).isFile()) {
      console.log(`${command} is ${fullpath}`);
      found = true;
      break; // Exit the loop as we've found the command
    }
  }
  if (!found) {
    console.log(`${command}: not found`);
  }
}
function execCommands(answer) {
  let found = false;
  const paths = process.env.PATH.split(path.delimiter);
  const fileName = answer.split(" ")[0];
  const args = answer.split(" ").slice(1);
  for (let p of paths) {
    const fullpath = path.join(p, fileName);
    if (fs.existsSync(fullpath) && fs.statSync(fullpath).isFile()) {
      // Execute command with the given arguments
      execFileSync(fullpath, args, {
        encoding: "utf-8",
        stdio: "inherit",
        argv0: fileName,
      });
      found = true;
      break; // Exit the loop as we've executed the command
    }
  }
  if (!found) {
    console.log(`${answer}: command not found`);
  }
}
function absolutePath(answer) {
  let pathArg = answer.split(" ")[1];
  let newWorkDir = currWorkDir;
  // Check for ~ and replace it with the HOME environment variable
  if (pathArg.startsWith("~")) {
    pathArg = pathArg.replace("~", process.env.HOME || "/home/user"); // Replace ~ with HOME env variable
  }
  if (pathArg.startsWith("/")) {
    newWorkDir = pathArg; // Absolute path, start from root
  } else {
    // If it's a relative path, we need to build it
    const steps = pathArg.split("/");
    for (const step of steps) {
      if (step === "." || step === "") continue;
      else if (step === "..") {
        newWorkDir = newWorkDir.split("/").slice(0, -1).join("/"); // Move up one directory
      } else {
        newWorkDir = path.join(newWorkDir, step);
      }
    }
  }
  // Check if the directory exists
  if (!fs.existsSync(newWorkDir)) {
    console.log(`cd: ${pathArg}: No such file or directory`);
    return;
  }
  currWorkDir = newWorkDir; // Update the current working directory
}
prompt(); // Start the prompt initially