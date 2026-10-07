// Dispatches branchlet compression, validation and visual comparison packaging.
import {readFile} from 'node:fs/promises';
const options = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (options.phase === 'compress') await (await import('./Compress.mjs')).compress(options);
else if (options.phase === 'validate') await (await import('./Validate.mjs')).validate(options);
else if (options.phase === 'gallery') await (await import('./Gallery.mjs')).gallery(options);
