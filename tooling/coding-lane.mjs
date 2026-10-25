import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The marker contains the refusal message so every entry point names the same checkout.
export const laneMarker = '.arc-coding-lane';
export function requireMainCheckout() {
  for (const start of [fileURLToPath(new URL('../', import.meta.url)), process.cwd()]) {
    for (let directory = path.resolve(start); ; directory = path.dirname(directory)) {
      let message;
      try { message = readFileSync(path.join(directory, laneMarker), 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (message !== undefined) throw new Error(message.trim());
      if (path.dirname(directory) === directory) break;
    }
  }
}
