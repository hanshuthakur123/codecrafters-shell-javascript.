#include <ctype.h>
#include <dirent.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>
int contains(char *, char **); // one day you will need this
char *find_executable(char *);
int execute(char *args[]);
void parse_quotes(char *, char **);
void getInput(char *);
char **autocomplete_exec(char *, int *flag);
void enableRawMode() {
  struct termios raw;
  tcgetattr(STDIN_FILENO, &raw);
  raw.c_lflag &= ~(ICANON | ECHO); // Disable line buffering & echo
  tcsetattr(STDIN_FILENO, TCSANOW, &raw);
}
void disableRawMode() {
  struct termios raw;
  tcgetattr(STDIN_FILENO, &raw);
  raw.c_lflag |= (ICANON | ECHO);
  tcsetattr(STDIN_FILENO, TCSANOW, &raw);
}
int compare_strings(const void *a, const void *b) {
  return strcmp(*(const char **)a, *(const char **)b);
}
void removeDirFromPath(const char *dir) {
  char *path = getenv("PATH");
  if (!path) {
    printf("PATH variable not found.\n");
    return;
  }
  // printf("\n%s\n", path);
  size_t dir_len = strlen(dir);
  char new_path[4096]; // Make sure this is large enough
  new_path[0] = '\0';  // Start with an empty string
  char *token = strtok(path, ":");
  while (token) {
    if (strcmp(token, dir) != 0) { // Keep only non-matching paths
      if (new_path[0] != '\0')
        strcat(new_path, ":");
      strcat(new_path, token);
    }
    token = strtok(NULL, ":");
  }
  setenv("PATH", new_path, 1); // Update PATH
}
int contains(char *to_find, char **array) {
  int index = 0;
  while (array[index] != NULL) {              // Check for NULL terminator
    if (strcmp(array[index], to_find) == 0) { // Compare current string
      return index;                           // Return index if found
    }
    index++; // Move to next element
  }
  // printf("index");
  return -1; // Not found
}
char **autocomplete_exec(char *cmd, int *command_count) {
  removeDirFromPath("/usr/local/sbin");
  removeDirFromPath("/usr/sbin");
  removeDirFromPath("/usr/bin");
  removeDirFromPath("/sbin");
  removeDirFromPath("/bin");
  removeDirFromPath("/usr/local/bin");
  // setenv("PATH",
  // "/tmp/bar:/tmp/baz:/tmp/foo:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  // 1);
  char *path = getenv("PATH");
  if (path == NULL) {
    return NULL;
  }
  char *path_copy = strdup(path);
  // printf("\n%s\n%s\n", path_copy, path);
  char *dir_path = strtok(path_copy, ":");
  // char *dir_path = strtok(path, ":");
  char **commands = malloc(1024 * sizeof(char *)); // Array of command names
  if (commands == NULL) {
    return NULL;
  }
  // commands[0] = '\0';
  //  int command_count = 0;
  *command_count = 0;
  commands[*command_count] = NULL; // Add NULL terminator
  while (dir_path != NULL) {
    //
    DIR *dir = opendir(dir_path);
    if (dir == NULL) {
      printf("\n%s\n", dir_path);
      perror("opendir failed");
      return NULL;
    }
    struct dirent *entry;
    if (dir != NULL) {
      while ((entry = readdir(dir)) != NULL) {
        // printf("dir path %s", dir_path);
        // printf("%d", contains(entry->d_name, commands));
        if (strncmp(cmd, entry->d_name, strlen(cmd)) == 0 &&
            (contains(entry->d_name, commands) == -1)) {
          commands[*command_count] =
              strdup(entry->d_name); // Store command name
          (*command_count)++;
        }
      }
      closedir(dir);
      dir_path = strtok(NULL, ":");
      // printf("\nhuh%s\n", dir_path);
    } else {
      // printf("girl%s", dir_path);
    }
  }
  // printf("\nthe commands\n");
  if (*command_count == 0) {
    return NULL;
  } else {
    qsort(commands, *command_count, sizeof(char *), compare_strings);
    return commands;
  }
  // printf("heeeheh");
}
void getInput(char *input) {
  int pos = 0;
  char ch;
  enableRawMode();
  // TODO: add already asked commands, so if command with many matches first
  // time, ring bell and add to this then the second time, print the stuff
  int save_commands = 0;
  int tab_count = 0;
  while (1) {
    ch = getchar();
    // printf("char %c", ch);
    if (ch == '\n') { // Enter key
      input[pos] = '\0';
      printf("\n");
      break;
    } else if (ch == '\t') { // Tab key
      input[pos] = '\0';     // Ensure valid string
      if (strcmp(input, "ech") == 0) {
        strcpy(input, "echo ");
        pos = 5;
      } else if (strcmp(input, "exi") == 0) {
        strcpy(input, "exit ");
        pos = 5;
      } else if (strcmp(input, "typ") == 0) {
        strcpy(input, "type ");
        pos = 5;
      } else {
        // printf("heheheh\n");
        // printf("%s,fjfj\n", input);
        int count = 0;
        char **find_exec = autocomplete_exec(input, &count);
        // printf("\ntest%d\n", count);
        if (find_exec != NULL || count != 0) {
          if (count == 1) {
            strcpy(input, find_exec[0]);
            strcat(input, " ");
            pos = strlen(input);
            tab_count = 0;
          } else if (count > 1) {
            if (tab_count == 0) {
              // ring bell
              printf("\a");
              // printf("here\n");
              tab_count++;
            } else {
              printf("\n");
              for (int i = 0; i < count; i++) {
                printf("%s  ", find_exec[i]);
              }
              printf("\n");
              tab_count = 0;
            }
          }
        } else {
          printf("\a");
          fflush(stdout);
        }
      }
      printf("\r$ %s", input); // Overwrite with completion
      fflush(stdout);
    } else if (ch == 127 || ch == '\b') { // Handle backspace
      if (pos > 0) {
        pos--;
        printf("\b \b"); // Erase last character
        fflush(stdout);
      }
    } else if (pos < 100 - 1) { // Normal character input
      input[pos++] = ch;
      putchar(ch);
      fflush(stdout);
    }
  }
  disableRawMode();
}
int main() {
  // Flush after every printf
  char ex[] = "exit 0";
  char echo[] = "echo";
  while (1) {
    setbuf(stdout, NULL);
    // Uncomment this block to pass the first stage
    printf("$ ");
    // Wait for user input
    char input[100];
    getInput(input);
    if (strcmp(ex, input) == 0) {
      break;
    } else if (strncmp(input, "type ", 5) == 0) {
      if (strcmp(input + 5, "echo") == 0 || strcmp(input + 5, "exit") == 0 ||
          strcmp(input + 5, "type") == 0 || strcmp(input + 5, "pwd") == 0) {
        printf("%s is a shell builtin\n", input + 5);
        continue;
      }
      char *path = find_executable(input + 5);
      if (path != NULL) {
        // char * path = ;
        printf("%s is %s\n", input + 5, path);
      } else {
        printf("%s: not found\n", input + 5);
      }
    } else if (strncmp(input, "pwd", 3) == 0) {
      char cwd[1024];
      if (getcwd(cwd, sizeof(cwd)) != NULL) {
        printf("%s\n", cwd);
      }
    } else if (strncmp(input, "cd", 2) == 0) {
      char *dir = input + 3;
      if (strcmp(input + 3, "~") == 0) {
        dir = getenv("HOME");
      }
      int status = chdir(dir);
      if (status != 0) {
        printf("cd: %s: No such file or directory\n", input + 3);
      }
    } else {
      char *args[25];
      parse_quotes(input, args);
      char *path = find_executable(args[0]);
      if (path == NULL) {
        printf("%s: command not found\n", input);
        continue;
      }
      execute(args);
    }
  }
  return 0;
}
char *find_executable(char *cmd) {
  char *path = getenv("PATH");
  if (path == NULL) {
    return NULL;
  }
  char full_path[1024]; // to add the current command to the file
  char *path_copy = strdup(path);
  char *dir = strtok(path_copy, ":");
  while (dir != NULL) {
    /* code */
    char full_path[1024]; // Ensure it's large enough
    // Copy the directory path into full_path
    strcpy(full_path, dir);
    // Append a slash (if needed) and then the command
    if (full_path[strlen(full_path) - 1] != '/') {
      strcat(full_path, "/");
    }
    strcat(full_path, cmd);
    if (access(full_path, X_OK) == 0) {
      return strdup(full_path);
    }
    dir = strtok(NULL, ":");
  }
  return NULL;
}
int execute(char *args[]) {
  pid_t pid;
  int status;
  pid = fork();
  if (pid == -1) {
    perror("fork");
    exit(1);
  } else if (pid == 0) {
    int to_redirect = -1;
    int flags = O_WRONLY | O_CREAT;
    int redirect = -1; // = contains("1>",args);
    if ((redirect = contains("1>", args)) != -1 ||
        (redirect = contains(">", args)) != -1) {
      to_redirect = STDOUT_FILENO;
      flags |= O_TRUNC;
    } else if ((redirect = contains("2>", args)) != -1) {
      to_redirect = STDERR_FILENO;
      flags |= O_TRUNC;
    } else if ((redirect = contains(">>", args)) != -1 ||
               (redirect = contains("1>>", args)) != -1) {
      to_redirect = STDOUT_FILENO;
      flags |= O_APPEND;
    } else if ((redirect = contains("2>>", args)) != -1) {
      to_redirect = STDERR_FILENO;
      flags |= O_APPEND;
    }
    if (redirect != -1) {
      int fp = open(args[redirect + 1], flags, 0644);
      if (fp < 0) {
        perror("open");
        exit(1);
      }
      int original_stdout = dup(to_redirect);
      if (dup2(fp, to_redirect) < 0) {
        perror("dup2");
        exit(1);
      }
      close(fp);
      args[redirect] = NULL;
    }
    execvp(args[0], args);
    perror("execv"); // execv only returns if an error occurs
    exit(1);
  } else {
    // Parent process
    waitpid(pid, &status, 0);
  }
  // TODO: learn how execvp, waitpid and fork works
  return 0;
}
void parse_quotes(char *input, char *args[]) {
  int i = 0;
  const char *ptr = input;
  char buffer[1024]; // Temp buffer to store arguments
  int buf_index = 0;
  char quote = 0; // Tracks whether we are inside a quote
  int backslash = 0;
  while (*ptr) {
    if (isspace(*ptr) && !quote &&
        !backslash) { // Space outside quotes is a separator
      if (buf_index > 0) {
        buffer[buf_index] = '\0';
        args[i++] = strdup(buffer);
        buf_index = 0;
      }
    } else if (*ptr == '"' || *ptr == '\'') { // Handle quotes
      if (backslash == 1) {
        buffer[buf_index++] = *ptr;
        backslash = 0;
      } else {
        if (quote == 0) {
          quote = *ptr; // Start of quoted string
        } else if (quote == *ptr) {
          quote = 0; // End of quoted string
        } else {
          buffer[buf_index++] = *ptr; // Treat it as normal text
        }
      }
    } else {
      if (*ptr == '\\') {
        // printf("test%c%d\n",quote,backslash);
        if (quote == '\'' || backslash == 1) {
          buffer[buf_index++] = *ptr; // add / as a character
          if (backslash == 1) {
            backslash = 0;
          }
          // backslash = 0;
        } else if (quote == '\"') {
          // if backslash is followed by x vs backslash not followed by x
          if (*(ptr + 1) == '\\') {
            backslash = 1;
          } else if (*(ptr + 1) == '\"') {
            backslash = 1;
          } else {
            buffer[buf_index++] = *ptr;
            if (backslash == 1) {
              backslash = 0;
            }
          }
        } else {
          backslash = 1;
        }
      } else {
        buffer[buf_index++] = *ptr; // Normal character
        backslash = 0;
      }
    }
    ptr++;
  }
  if (buf_index > 0) { // Add last argument
    buffer[buf_index] = '\0';
    args[i++] = strdup(buffer);
  }
  args[i] = NULL; // Null-terminate the array
}