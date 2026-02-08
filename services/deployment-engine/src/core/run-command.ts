import { exec } from 'child_process';

export const runCommand = async (command: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
};

export type LogCallback = (line: string) => void;

/**
 * Run a command and stream stdout/stderr lines to a callback in real time.
 * Uses exec (which handles Windows cmd.exe quoting correctly) with
 * streaming listeners on the underlying ChildProcess stdout/stderr.
 */
export const runCommandStreaming = async (
  command: string,
  onLog?: LogCallback,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = exec(command, { maxBuffer: 1024 * 1024 * 50 });

    const stdoutChunks: Buffer[] = [];
    let stderrText = '';

    const emitLine = (line: string) => {
      const trimmed = line.trim();
      if (trimmed && onLog) {
        onLog(trimmed);
      }
    };

    let stdoutRemainder = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      stdoutChunks.push(data);
      const text = stdoutRemainder + data.toString('utf8');
      const lines = text.split(/\r?\n/);
      stdoutRemainder = lines.pop() ?? '';
      for (const line of lines) {
        emitLine(line);
      }
    });

    let stderrRemainder = '';
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = stderrRemainder + (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      stderrText += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      stderrRemainder = lines.pop() ?? '';
      for (const line of lines) {
        emitLine(line);
      }
    });

    child.on('close', (code) => {
      if (stdoutRemainder.trim()) emitLine(stdoutRemainder);
      if (stderrRemainder.trim()) emitLine(stderrRemainder);

      if (code !== 0) {
        reject(new Error(stderrText.trim() || `Command exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString('utf8').trim());
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};
