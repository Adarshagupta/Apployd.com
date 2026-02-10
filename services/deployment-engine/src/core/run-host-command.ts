import { runCommand } from './run-command.js';

let isInContainerCached: boolean | null = null;

async function checkIsInContainer(): Promise<boolean> {
  if (isInContainerCached !== null) return isInContainerCached;
  
  try {
    await runCommand('test -f /.dockerenv');
    isInContainerCached = true;
  } catch {
    isInContainerCached = false;
  }
  return isInContainerCached;
}

/**
 * Run a command on the host system (from within a container).
 * Uses nsenter to enter the host's namespaces via PID 1.
 * Requires the container to be run with --privileged and --pid=host.
 */
export async function runHostCommand(command: string): Promise<string> {
  const isInContainer = await checkIsInContainer();
  
  if (isInContainer) {
    // Use nsenter to run on host - requires privileged container with pid=host
    const escapedCommand = command.replace(/"/g, '\\"');
    return runCommand(`nsenter -t 1 -m -u -n -i sh -c "${escapedCommand}"`);
  } else {
    return runCommand(command);
  }
}
