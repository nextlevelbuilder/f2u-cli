import { Command } from 'commander';
import { makeAuthCommand } from './commands/auth-command.js';
import { makeUploadCommand } from './commands/upload-command.js';
import { makeListCommand } from './commands/list-command.js';
import { makeDeleteCommand } from './commands/delete-command.js';
import { makeInfoCommand } from './commands/info-command.js';
import { makeUsageCommand } from './commands/usage-command.js';

const program = new Command()
  .name('f2u')
  .description('Upload temporary files to Cloudflare R2 (for AI agents)')
  .version('0.1.0');

program.addCommand(makeAuthCommand());
program.addCommand(makeUploadCommand());
program.addCommand(makeListCommand());
program.addCommand(makeDeleteCommand());
program.addCommand(makeInfoCommand());
program.addCommand(makeUsageCommand());

program.parse();
