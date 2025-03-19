const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const getInput = () => {
  return new Promise((resolve) => {
    let input = '';
    let pos = 0;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
      if (key === '\r' || key === '\n') { // Enter key
        process.stdout.write('\n');
        process.stdin.pause();
        resolve(input); // Resolve with the user input
      } else if (key === '\t') { // Tab key
        const matches = autocompleteExec(input);
        if (matches && matches.length > 0) {
          if (matches.length > 1) {
            process.stdout.write('\a'); // Ring the bell
          } else {
            input = matches[0] + ' ';
            pos = input.length;
          }
        } else {
          process.stdout.write('\a'); // Ring the bell if no matches
        }
      } else if (key === '\x7f' || key === '\b') { // Backspace
        if (pos > 0) {
          input = input.slice(0, pos - 1) + input.slice(pos);
          pos--;
        }
      } else if (key.length === 1 && pos < 100) { // Normal character input
        input = input.slice(0, pos) + key + input.slice(pos);
        pos++;
      }
      // Update the prompt
      process.stdout.write('\x1b[2K\r$ ' + input);
    });
  });
};

const autocompleteExec = (cmd) => {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(':');
  const commands = new Set();

  dirs.forEach((dir) => {
    try {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        if (file.startsWith(cmd)) {
          commands.add(file);
        }
      });
    } catch (err) {
      // Ignore directories that cannot be read
    }
  });

  return Array.from(commands).sort();
};

const main = async () => {
  while (true) {
    process.stdout.write('$ ');
    const input = await getInput(); // Await user input

    if (input === 'exit 0') {
      break;
    } else if (input.startsWith('type ')) {
      const cmd = input.slice(5);
      if (['echo', 'exit', 'type', 'pwd'].includes(cmd)) {
        console.log(`${cmd} is a shell builtin`);
      } else {
        const path = findExecutable(cmd);
        if (path) {
          console.log(`${cmd} is ${path}`);
        } else {
          console.log(`${cmd}: not found`);
        }
      }
    } else if (input.startsWith('pwd')) {
      console.log(process.cwd());
    } else if (input.startsWith('cd ')) {
      const dir = input.slice(3) === '~' ? process.env.HOME : input.slice(3);
      try {
        process.chdir(dir);
      } catch (err) {
        console.log(`cd: ${dir}: No such file or directory`);
      }
    } else {
      const args = parseQuotes(input);
      const path = findExecutable(args[0]);
      if (!path) {
        console.log(`${args[0]}: command not found`);
        continue;
      }
      try {
        const { stdout, stderr } = await execute(args);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      } catch (err) {
        console.error(err);
      }
    }
  }
};

main().catch((err) => {
  console.error('An error occurred:', err);
});