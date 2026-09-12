// Uses the same authenticated parser in a worker and returns exclusively owned payload storage.
import { parseTransferredIlluminationBinaryPackage, transferIlluminationPackageOwnership } from './IlluminationBinaryPackage.js';

self.onmessage = async ({ data: { bytes, options } }) => {
    try {
        const parsed = await parseTransferredIlluminationBinaryPackage(transferIlluminationPackageOwnership(bytes), options);
        self.postMessage({ parsed }, [...new Set(parsed.chunks.map(chunk => chunk.data.buffer))]);
    } catch (error) {
        self.postMessage({ error: { code: error.code ?? 'background_validation_failed', message: error.message, details: error.details } });
    }
};
