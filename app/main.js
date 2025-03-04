const readline = require("readline");
const { start } = require("repl");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "$ ",
});

function startREPL() {
  rl.prompt();
  rl.on("line", (command) => {
    const words = command.split(" ");
    const firstWord = words[0];
    if (command == "exit 0") {
      rl.close();
    } else if (firstWord == "echo") {
      console.log(words.slice(1).join(" "));
      rl.prompt();
    } else {
      console.log(`${command}: command not found`);
      rl.prompt();
    }
  });
}
startREPL();