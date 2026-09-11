// Compress stopped recordings away from the rendering thread.
import { encodeFrameRecording } from './FrameRecording.js';
self.onmessage = async ({ data }) => {
    try { self.postMessage({ text: await encodeFrameRecording(data) }); }
    catch (error) { self.postMessage({ error: error.message }); }
};
