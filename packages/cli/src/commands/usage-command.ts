import { Command } from 'commander';
import { requireConfig } from '../config.js';
import { ApiClient } from '../api-client.js';

export function makeUsageCommand(): Command {
  return new Command('usage')
    .description('Show storage usage statistics')
    .action(async () => {
      const config = requireConfig();
      const client = new ApiClient(config);

      try {
        const stats = await client.usage();
        process.stdout.write(JSON.stringify(stats) + '\n');
      } catch (err) {
        process.stderr.write(
          JSON.stringify({ error: 'Usage fetch failed', detail: err instanceof Error ? err.message : String(err) }) +
            '\n',
        );
        process.exit(1);
      }
    });
}
