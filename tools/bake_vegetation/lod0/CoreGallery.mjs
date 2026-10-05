// Reuse matched-camera authentication and counts for the core-canopy comparison and wireframes.
import {readFile} from 'node:fs/promises';
import {buildRevisionGallery} from './RevisionGallery.mjs';

const options = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (options.placement !== 'core') throw new Error('Expected core canopy placement');
await buildRevisionGallery(options);
