import { Command } from 'commander';
import { requireConfig } from '../config.js';
import { ApiClient } from '../api-client.js';

export function makeListCommand(): Command {
  return new Command('ls')
    .description('List all active uploaded files')
    .action(async () => {
      const config = requireConfig();
      const client = new ApiClient(config);

      try {
        const files = await client.listFiles();
        process.stdout.write(JSON.stringify(files) + '\n');
      } catch (err) {
        process.stderr.write(
          JSON.stringify({ error: 'List failed', detail: err instanceof Error ? err.message : String(err) }) + '\n',
        );
        process.exit(1);
      }
    });
}
