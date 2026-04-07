import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
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

export function requireConfig(): F2uConfig {
  // Check env vars first: F2U_ENDPOINT and F2U_API_KEY
  const envEndpoint = process.env['F2U_ENDPOINT'];
  const envKey = process.env['F2U_API_KEY'];
  if (envEndpoint && envKey) {
    return { endpoint: envEndpoint.replace(/\/$/, ''), api_key: envKey };
  }

  const config = loadConfig();
  if (!config) {
    process.stderr.write(
      JSON.stringify({ error: 'Not configured. Run: f2u auth --endpoint <url> --key <key>' }) + '\n',
    );
    process.exit(1);
  }
  // Strip trailing slash for consistency
  config.endpoint = config.endpoint.replace(/\/$/, '');
  return config;
}
