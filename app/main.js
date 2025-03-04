const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
// Uncomment this block to pass the first stage
const types = ['echo', 'exit', 'type'];
let recursive = function() {
  rl.question("$ ", (answer) => {
    const [commandType, text] = answer.split(' ');
    if(commandType.startsWith('type')) {
      if(types.includes(text)) {
        console.log(`${text} is a shell builtin`);
      } else {
        console.log(`${text}: not found`);
      }
      recursive();
    } else if (answer === 'exit 0') {
      rl.close();
      return;
    } else if(commandType.startsWith('echo')) {
      const echoText = answer.split('echo ');
      console.log(echoText[1]);
      recursive();
    } else {
      console.log(`${answer}: command not found`);
      recursive();
    }
  })
};
recursive();