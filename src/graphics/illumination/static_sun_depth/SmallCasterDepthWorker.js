// Builds one independently visible opaque-prop layer away from the gameplay thread.
import { rasterizeSmallCaster } from '../../../app/illumination/static_sun_depth/SmallCasterDepthRaster.js';
self.onmessage = ({ data }) => {
    try {
        const raw = rasterizeSmallCaster(data);
        self.postMessage({ raw }, [raw.buffer]);
    } catch (error) { self.postMessage({ error: error.message }); }
};
