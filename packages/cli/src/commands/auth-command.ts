import { Command } from 'commander';
import { saveConfig } from '../config.js';

export function makeAuthCommand(): Command {
  return new Command('auth')
    .description('Configure f2u with your Worker endpoint and API key')
    .requiredOption('--endpoint <url>', 'Worker base URL (e.g. https://f2u.example.com)')
    .requiredOption('--key <key>', 'API key for authentication')
    .action((opts: { endpoint: string; key: string }) => {
      const config = {
        endpoint: opts.endpoint.replace(/\/$/, ''),
        api_key: opts.key,
      };
      saveConfig(config);
      process.stdout.write(
        JSON.stringify({ success: true, endpoint: config.endpoint, message: 'Configuration saved.' }) + '\n',
      );
    });
}
