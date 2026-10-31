import System from 'system';

import { run } from './harness.js';
import './typeDetect.test.js';
import './historyQuery.test.js';
import './pastePlan.test.js';
import './historyStore.test.js';
import './schema.test.js';

const failures = await run();
System.exit(failures === 0 ? 0 : 1);
