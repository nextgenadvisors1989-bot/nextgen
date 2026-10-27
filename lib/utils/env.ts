/**
 * Minimal .env loader for CLI scripts (Next.js loads .env itself for the app).
 * Deliberately dependency-free so scripts run before anything is installed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

export function loadEnv(file = '.env'): void {
  if (loaded) return;
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();

      // Quoted values are taken verbatim; unquoted values end at an inline
      // comment. This matches the dotenv behaviour Next.js uses at runtime, so
      // a CLI script and the app always read the same value.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        const commentAt = value.indexOf(' #');
        if (commentAt !== -1) value = value.slice(0, commentAt).trim();
        if (value.startsWith('#')) value = '';
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
  loaded = true;
}

export function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
