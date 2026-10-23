import path from 'node:path';
import { homedir } from 'node:os';

const stateBase = process.platform === 'win32'
  ? process.env.LOCALAPPDATA || path.join(homedir(), 'AppData/Local')
  : process.platform === 'linux'
    ? process.env.XDG_STATE_HOME || path.join(homedir(), '.local/state')
    : path.join(homedir(), '.local/state');

// Both entry points use installed data. Tests may explicitly select a temporary instance.
export const stateDir = path.resolve(process.env.ARC_STATE_DIR || path.join(stateBase, 'agent-remote-control'));
