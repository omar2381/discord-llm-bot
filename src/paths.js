import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));

export const COMMANDS_DIR = join(SRC, 'commands');
export const EVENTS_DIR = join(SRC, 'events');
export const COMPONENTS_DIR = join(SRC, 'components');
