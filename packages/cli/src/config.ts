import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.config', 'f2u');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface F2uConfig {
  endpoint: string;
  api_key: string;
}

export function loadConfig(): F2uConfig | null {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as F2uConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: F2uConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_FILE, 0o600);
}

/**
 * Minimal .env parser. Supports:
 *   KEY=value
 *   KEY="value with spaces"
 *   KEY='value'
 *   # comments
 * Keeps dependencies at zero (KISS).
 */
function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // strip trailing inline comment for unquoted values
      const hashIdx = value.indexOf(' #');
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    }
    env[key] = value;
  }
  return env;
}

/**
 * Load .env.* files from CWD in order of increasing precedence:
 *   .env  <  .env.{NODE_ENV}  <  .env.local
 * process.env still overrides all of these.
 */
function loadDotEnvFiles(cwd = process.cwd()): Record<string, string> {
  const names = ['.env'];
  if (process.env['NODE_ENV']) names.push(`.env.${process.env['NODE_ENV']}`);
  names.push('.env.local');

  const merged: Record<string, string> = {};
  for (const name of names) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      Object.assign(merged, parseDotEnv(readFileSync(path, 'utf-8')));
    } catch {
      // ignore unreadable files silently — CLI emits JSON only
    }
  }
  return merged;
}

/**
 * Resolve credentials with precedence (high → low):
 *   1. process.env (OS-level + shell-exported + inline)
 *   2. .env.local  (CWD)
 *   3. .env.{NODE_ENV}  (CWD)
 *   4. .env  (CWD)
 *   5. ~/.config/f2u/config.json
 *
 * Per-field merge: partial overrides are allowed (e.g. endpoint from env,
 * api_key from config file).
 */
export function requireConfig(): F2uConfig {
  const fileEnv = loadDotEnvFiles();
  const fileConfig = loadConfig();

  const endpoint =
    process.env['F2U_ENDPOINT'] ?? fileEnv['F2U_ENDPOINT'] ?? fileConfig?.endpoint;
  const apiKey =
    process.env['F2U_API_KEY'] ?? fileEnv['F2U_API_KEY'] ?? fileConfig?.api_key;

  if (!endpoint || !apiKey) {
    process.stderr.write(
      JSON.stringify({
        error:
          'Not configured. Run: f2u auth --endpoint <url> --key <key>, or set F2U_ENDPOINT and F2U_API_KEY via env / .env file.',
      }) + '\n',
    );
    process.exit(1);
  }

  return {
    endpoint: endpoint.replace(/\/$/, ''),
    api_key: apiKey,
  };
}
