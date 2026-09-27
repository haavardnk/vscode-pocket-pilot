import { homedir } from 'node:os';

import { hookFilePath, removeHooks } from './hooks/hookFile';

void removeHooks(hookFilePath(homedir()));
