import { Command } from 'commander';
import { requireConfig } from '../config.js';
import { ApiClient } from '../api-client.js';

export function makeDeleteCommand(): Command {
  return new Command('rm')
    .description('Delete an uploaded file by ID')
    .argument('<id>', 'File ID to delete')
    .action(async (id: string) => {
      const config = requireConfig();
      const client = new ApiClient(config);

      try {
        const result = await client.deleteFile(id);
        process.stdout.write(JSON.stringify(result) + '\n');
      } catch (err) {
        process.stderr.write(
          JSON.stringify({ error: 'Delete failed', detail: err instanceof Error ? err.message : String(err) }) + '\n',
        );
        process.exit(1);
      }
    });
}
