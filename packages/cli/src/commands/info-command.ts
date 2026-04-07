import { Command } from 'commander';
import { requireConfig } from '../config.js';
import { ApiClient } from '../api-client.js';

export function makeInfoCommand(): Command {
  return new Command('info')
    .description('Get details for a file including TTL remaining')
    .argument('<id>', 'File ID to inspect')
    .action(async (id: string) => {
      const config = requireConfig();
      const client = new ApiClient(config);

      try {
        const info = await client.fileInfo(id);
        process.stdout.write(JSON.stringify(info) + '\n');
      } catch (err) {
        process.stderr.write(
          JSON.stringify({ error: 'Info fetch failed', detail: err instanceof Error ? err.message : String(err) }) +
            '\n',
        );
        process.exit(1);
      }
    });
}
