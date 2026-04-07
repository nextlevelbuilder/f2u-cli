# Phase 4: CLI Tool

## Overview
- **Priority**: P1
- **Status**: Pending
- **Effort**: 2h
- **Blocked by**: Phase 1 (scaffold), Phase 2 (API contract)

Implement the `f2u` CLI using Commander.js. All output is JSON for AI agent consumption. Config stored at `~/.config/f2u/config.json`.

## Related Code Files

- `packages/cli/src/index.ts` — entry point, Commander program setup
- `packages/cli/src/config.ts` — config read/write
- `packages/cli/src/api-client.ts` — HTTP client wrapping Worker API
- `packages/cli/src/commands/auth.ts`
- `packages/cli/src/commands/upload.ts`
- `packages/cli/src/commands/list.ts`
- `packages/cli/src/commands/delete.ts`
- `packages/cli/src/commands/info.ts`
- `packages/cli/src/commands/usage.ts`

## Implementation Steps

### 1. Config module — `packages/cli/src/config.ts`

```typescript
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
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as F2uConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: F2uConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_FILE, 0o600); // restrict permissions
}

export function requireConfig(): F2uConfig {
  const config = loadConfig();
  if (!config) {
    console.error(JSON.stringify({ error: 'Not configured. Run: f2u auth' }));
    process.exit(1);
  }
  return config;
}
```

### 2. API client — `packages/cli/src/api-client.ts`

```typescript
import type { F2uConfig } from './config';

export class ApiClient {
  constructor(private config: F2uConfig) {}

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.config.endpoint}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.api_key}`,
        ...options.headers,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(JSON.stringify({ error: data.error || `HTTP ${res.status}` }));
      process.exit(1);
    }
    return data;
  }

  async upload(filePath: string, ttl: string): Promise<any> {
    const { readFileSync, statSync } = await import('node:fs');
    const { basename } = await import('node:path');
    const { lookup } = await import('node:path');

    const name = basename(filePath);
    const buffer = readFileSync(filePath);
    const blob = new Blob([buffer]);

    const formData = new FormData();
    formData.append('file', blob, name);
    formData.append('ttl', ttl);

    return this.request('/upload', { method: 'POST', body: formData });
  }

  async listFiles(): Promise<any> {
    return this.request('/files');
  }

  async deleteFile(id: string): Promise<any> {
    return this.request(`/${id}`, { method: 'DELETE' });
  }

  async fileInfo(id: string): Promise<any> {
    return this.request(`/info/${id}`);
  }

  async usage(): Promise<any> {
    return this.request('/usage');
  }
}
```

### 3. Auth command — `packages/cli/src/commands/auth.ts`

```typescript
import { Command } from 'commander';
import { saveConfig, loadConfig } from '../config';

export const authCommand = new Command('auth')
  .description('Configure f2u endpoint and API key')
  .requiredOption('--endpoint <url>', 'Worker endpoint URL (e.g., https://f2u.goclaw.sh)')
  .requiredOption('--key <key>', 'API key')
  .action((opts) => {
    saveConfig({ endpoint: opts.endpoint.replace(/\/$/, ''), api_key: opts.key });
    console.log(JSON.stringify({ status: 'configured', endpoint: opts.endpoint }));
  });
```

### 4. Upload command — `packages/cli/src/commands/upload.ts`

```typescript
import { Command } from 'commander';
import { requireConfig } from '../config';
import { ApiClient } from '../api-client';

const VALID_TTLS = ['5m', '15m', '30m', '1h', '6h', '12h', '24h'];

export const uploadCommand = new Command('up')
  .description('Upload a file')
  .requiredOption('-f, --file <path>', 'File path to upload')
  .option('-t, --ttl <ttl>', 'Time to live', '5m')
  .action(async (opts) => {
    if (!VALID_TTLS.includes(opts.ttl)) {
      console.error(JSON.stringify({ error: `Invalid TTL. Options: ${VALID_TTLS.join(', ')}` }));
      process.exit(1);
    }

    // Verify file exists
    const { existsSync } = await import('node:fs');
    if (!existsSync(opts.file)) {
      console.error(JSON.stringify({ error: `File not found: ${opts.file}` }));
      process.exit(1);
    }

    const config = requireConfig();
    const client = new ApiClient(config);
    const result = await client.upload(opts.file, opts.ttl);
    console.log(JSON.stringify(result));
  });
```

### 5. Other commands — list, delete, info, usage

Each follows the same pattern. Keeping them minimal:

```typescript
// packages/cli/src/commands/list.ts
import { Command } from 'commander';
import { requireConfig } from '../config';
import { ApiClient } from '../api-client';

export const listCommand = new Command('ls')
  .description('List active files')
  .action(async () => {
    const client = new ApiClient(requireConfig());
    console.log(JSON.stringify(await client.listFiles()));
  });
```

```typescript
// packages/cli/src/commands/delete.ts
import { Command } from 'commander';
import { requireConfig } from '../config';
import { ApiClient } from '../api-client';

export const deleteCommand = new Command('rm')
  .description('Delete a file')
  .argument('<id>', 'File ID')
  .action(async (id: string) => {
    const client = new ApiClient(requireConfig());
    console.log(JSON.stringify(await client.deleteFile(id)));
  });
```

```typescript
// packages/cli/src/commands/info.ts
import { Command } from 'commander';
import { requireConfig } from '../config';
import { ApiClient } from '../api-client';

export const infoCommand = new Command('info')
  .description('Get file details and TTL remaining')
  .argument('<id>', 'File ID')
  .action(async (id: string) => {
    const client = new ApiClient(requireConfig());
    console.log(JSON.stringify(await client.fileInfo(id)));
  });
```

```typescript
// packages/cli/src/commands/usage.ts
import { Command } from 'commander';
import { requireConfig } from '../config';
import { ApiClient } from '../api-client';

export const usageCommand = new Command('usage')
  .description('Show storage usage stats')
  .action(async () => {
    const client = new ApiClient(requireConfig());
    console.log(JSON.stringify(await client.usage()));
  });
```

### 6. Entry point — `packages/cli/src/index.ts`

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { authCommand } from './commands/auth';
import { uploadCommand } from './commands/upload';
import { listCommand } from './commands/list';
import { deleteCommand } from './commands/delete';
import { infoCommand } from './commands/info';
import { usageCommand } from './commands/usage';

const program = new Command()
  .name('f2u')
  .description('Upload temporary files to Cloudflare R2 (for AI agents)')
  .version('0.1.0');

program.addCommand(authCommand);
program.addCommand(uploadCommand);
program.addCommand(listCommand);
program.addCommand(deleteCommand);
program.addCommand(infoCommand);
program.addCommand(usageCommand);

program.parse();
```

## Edge Cases

- **File not found**: Check `existsSync` before upload, exit with JSON error
- **Network failure**: `fetch` throws — Commander catches unhandled rejection. Wrap in try/catch at ApiClient level for clean JSON error output.
- **Large files**: Node.js `readFileSync` loads entire file into memory. Acceptable for temporary file uploads (expect < 50MB). Document size limit.
- **No config**: `requireConfig()` exits with helpful JSON error message

## Todo

- [ ] Implement config module (load, save, require)
- [ ] Implement API client with auth header
- [ ] Implement `auth` command
- [ ] Implement `up` command with file validation and TTL validation
- [ ] Implement `ls` command
- [ ] Implement `rm` command
- [ ] Implement `info` command
- [ ] Implement `usage` command
- [ ] Wire all commands in index.ts entry point
- [ ] Add shebang line and verify `chmod +x` on build output
- [ ] Test `f2u --help` displays all commands
- [ ] Test `f2u auth --endpoint https://f2u.goclaw.sh --key test123` writes config

## Success Criteria

- `f2u --help` shows all 6 commands
- `f2u auth` saves config to `~/.config/f2u/config.json` with 0600 permissions
- All commands output valid JSON to stdout
- Errors output JSON to stderr with non-zero exit code
- `f2u up -f ./test.png -t 15m` uploads and prints `{ id, url, expires_at, ... }`
