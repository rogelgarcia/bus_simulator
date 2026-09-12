// Computes exact source and channel hashes from immutable export snapshots off the render thread.
import { buildBakeSourceHashSet } from '../../../app/illumination/bake_source/SourceHashSet.js';
import { buildChannelSourceHashes } from './BakeSourceFreshness.js';

self.onmessage = async ({ data: { input, context } }) => {
    try {
        const hashSet = await buildBakeSourceHashSet(input);
        self.postMessage({ phase: 'hashing_channels' });
        const channelSources = await buildChannelSourceHashes(input.channels, hashSet, context);
        self.postMessage({ hashSet, channelSources });
    } catch (error) { self.postMessage({ error: error.message }); }
};
