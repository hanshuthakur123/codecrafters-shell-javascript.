const readline = require("readline/promises");
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('node:child_process');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function handleInvalid(answer) {
  rl.write(`${answer}: command not found\n`);
}
function handleExit() {
  rl.close();
}
function handleEcho(answer) {
  rl.write(`${answer.split(" ").slice(1).join(" ")}\n`);
}
function handleType(answer) {
  const command = answer.split(' ')[1]
  const commands = ['exit', 'echo', 'type'] 
  if(commands.includes(command.toLowerCase())) {
    rl.write(`${command} is a shell builtin\n`)
  } else {
    const paths = process.env.PATH.split(":")
    for(const pathEnv of paths) {
      let destPath = path.join(pathEnv, command);
      if(fs.existsSync(destPath) && fs.statSync(destPath).isFile()){        
        rl.write(`${command} is ${destPath}\n`)
        return
      }
    }
    rl.write(`${command}: not found\n`)
  }
}
function handleFile(answer) {
  const fileName = answer.split(' ')[0]
  const args = answer.split(' ').slice(1)
  const paths = process.env.PATH.split(":")
  for(const pathEnv of paths) {
    let destPath = path.join(pathEnv, fileName);
    if(fs.existsSync(destPath) && fs.statSync(destPath).isFile()){        
      const baseName = path.basename(destPath);
      const output = execFileSync(destPath, args, { encoding: 'utf-8', stdio: 'pipe' });
      rl.write(output.replace(destPath, baseName));
      return;
    }
  }
  rl.write(`${fileName}: command not found\n`);
}
async function question() {
  const answer = await rl.question("$ ");
  if (answer.startsWith("invalid")) {
    handleInvalid(answer);
    question();
  } else {
    switch (answer.split(" ")[0].toLowerCase()) {
      case "exit":
        handleExit();
        break;
      case "echo":
        handleEcho(answer);
        question();
        break;
      case "type":
          handleType(answer);
          question();
          break;
      default:
        handleFile(answer);
        question()
    }
  }
}
question();