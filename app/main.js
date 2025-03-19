const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Simulate raw mode in terminal
const enableRawMode = () => {
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
};

const disableRawMode = () => {
  const stdin = process.stdin;
  stdin.setRawMode(false);
  stdin.pause();
};

const compareStrings = (a, b) => a.localeCompare(b);

const removeDirFromPath = (dir) => {
  let pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(':').filter(d => d !== dir);
  process.env.PATH = dirs.join(':');
};

const contains = (toFind, array) => array.indexOf(toFind);

const autocompleteExec = (cmd) => {
  ['/usr/local/sbin', '/usr/sbin', '/usr/bin', '/sbin', '/bin', '/usr/local/bin'].forEach(dir => removeDirFromPath(dir));

  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(':');
  const commands = new Set();

  dirs.forEach(dir => {
    try {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.startsWith(cmd)) {
          commands.add(file);
        }
      });
    } catch (err) {
      // Ignore directories that cannot be read
    }
  });

  const sortedCommands = Array.from(commands).sort(compareStrings);
  return sortedCommands.length > 0 ? sortedCommands : null;
};

const getInput = () => {
  let input = '';
  let pos = 0;
  let tabCount = 0;

  const clearLine = () => {
    process.stdout.write('\x1b[2K'); // Clear the entire line
    process.stdout.write('\r');      // Move cursor to the beginning of the line
  };

  const displayPrompt = () => {
    process.stdout.write(`$ ${input}`);
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    if (key === '\r' || key === '\n') { // Enter key
      process.stdout.write('\n');
      process.stdin.pause();
      resolve(input);
    } else if (key === '\t') { // Tab key
      const matches = autocompleteExec(input);
      if (matches && matches.length > 0) {
        if (matches.length > 1) {
          if (tabCount === 0) {
            process.stdout.write('\a'); // Ring the bell
            tabCount++;
          } else {
            clearLine();
            console.log(matches.join('  ')); // Display all matches
            tabCount = 0;
          }
        } else if (matches.length === 1) {
          input = matches[0] + ' ';
          pos = input.length;
          tabCount = 0;
        }
        clearLine();
        displayPrompt();
      } else {
        process.stdout.write('\a'); // Ring the bell if no matches
      }
    } else if (key === '\x7f' || key === '\b') { // Backspace
      if (pos > 0) {
        input = input.slice(0, pos - 1) + input.slice(pos);
        pos--;
        clearLine();
        displayPrompt();
      }
    } else if (key.length === 1 && pos < 100) { // Normal character input
      input = input.slice(0, pos) + key + input.slice(pos);
      pos++;
      clearLine();
      displayPrompt();
    }
  });
};

const findExecutable = (cmd) => {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(':');

  for (const dir of dirs) {
    const fullPath = path.join(dir, cmd);
    try {
      fs.accessSync(fullPath, fs.constants.X_OK);
      return fullPath;
    } catch (err) {
      // Ignore and continue
    }
  }
  return null;
};

const execute = (args) => {
  return new Promise((resolve, reject) => {
    const child = exec(args.join(' '), (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });

    child.stdin.end();
  });
};

const parseQuotes = (input) => {
  const args = [];
  let buffer = '';
  let quote = '';
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      buffer += char;
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else if (char === '"' || char === "'") {
      if (quote === char) {
        quote = '';
      } else if (!quote) {
        quote = char;
      } else {
        buffer += char;
      }
    } else if (char === ' ' && !quote) {
      if (buffer) {
        args.push(buffer);
        buffer = '';
      }
    } else {
      buffer += char;
    }
  }

  if (buffer) {
    args.push(buffer);
  }

  return args;
};

const main = async () => {
  while (true) {
    const input = await getInput();

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

main();