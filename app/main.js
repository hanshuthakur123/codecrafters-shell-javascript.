const readline = require("readline");
const {exit} = require("process");
const {prependListener} = require("process");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

//Uncomment this block to pass the first stage
function prompt() {
  rl.question("$ ", (answer) => {
   
    if(answer === "exit 0"){
      exit(0);
    }else{
      console.log(`${answer}: command not found`);
    }
    prompt(); // Recursively call the function to keep the loop going
  });
}
prompt();