const allCommands = getMatchingCommands(line);
// Use Set to remove duplicates
const uniqueCommands = [...new Set(allCommands)];
const hits = uniqueCommands.filter((c) => c.startsWith(line));