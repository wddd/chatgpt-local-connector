import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Only read user-provided keys into the child environment; never write or log them.
export function releaseSigningEnv(required = false) {
  const env = { ...process.env };
  const key = env.TAURI_SIGNING_PRIVATE_KEY;
  const keyIsPath = key && (existsSync(key) || path.isAbsolute(key) || key.startsWith('.') || key.startsWith('~'));
  const file = keyIsPath ? key : env.TAURI_SIGNING_PRIVATE_KEY_FILE || path.join(homedir(), '.tauri/agent-remote-control.key');
  if (!key || keyIsPath) {
    try {
      env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(file, 'utf8').trim();
    } catch (error) {
      if (keyIsPath || env.TAURI_SIGNING_PRIVATE_KEY_FILE || error.code !== 'ENOENT') {
        throw new Error('Cannot read the signing file. Check the path and permissions of TAURI_SIGNING_PRIVATE_KEY_FILE.');
      }
    }
  }
  env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
  if (required && !env.TAURI_SIGNING_PRIVATE_KEY) {
    throw new Error('Updater signing key missing. Set TAURI_SIGNING_PRIVATE_KEY, set TAURI_SIGNING_PRIVATE_KEY_FILE to an existing key, or configure ~/.tauri/agent-remote-control.key. For encrypted keys, also set TAURI_SIGNING_PRIVATE_KEY_PASSWORD. See docs/dev/release.md.');
  }
  return env;
}
