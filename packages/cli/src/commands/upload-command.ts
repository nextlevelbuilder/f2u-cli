import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { requireConfig } from '../config.js';
import { ApiClient } from '../api-client.js';

const VALID_TTLS = ['5m', '15m', '30m', '1h', '6h', '12h', '24h'] as const;
type Ttl = (typeof VALID_TTLS)[number];

function isValidTtl(value: string): value is Ttl {
  return (VALID_TTLS as readonly string[]).includes(value);
}

export function makeUploadCommand(): Command {
  return new Command('up')
    .description('Upload a file and get a temporary public URL')
    .requiredOption('-f, --file <path>', 'Path to the file to upload')
    .option('-t, --ttl <duration>', `TTL for the file (${VALID_TTLS.join(', ')})`, '5m')
    .action(async (opts: { file: string; ttl: string }) => {
      // Validate file exists
      if (!existsSync(opts.file)) {
        process.stderr.write(JSON.stringify({ error: `File not found: ${opts.file}` }) + '\n');
        process.exit(1);
      }

      // Validate TTL value
      if (!isValidTtl(opts.ttl)) {
        process.stderr.write(
          JSON.stringify({ error: `Invalid TTL "${opts.ttl}". Must be one of: ${VALID_TTLS.join(', ')}` }) + '\n',
        );
        process.exit(1);
      }

      const config = requireConfig();
      const client = new ApiClient(config);

      try {
        const result = await client.upload(opts.file, opts.ttl);
        process.stdout.write(JSON.stringify(result) + '\n');
      } catch (err) {
        process.stderr.write(
          JSON.stringify({ error: 'Upload failed', detail: err instanceof Error ? err.message : String(err) }) + '\n',
        );
        process.exit(1);
      }
    });
}
