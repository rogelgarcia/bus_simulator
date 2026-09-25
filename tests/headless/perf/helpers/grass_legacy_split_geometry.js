// Reconstructs the historical flat-top four-card layout for benchmarks, independently of the live inclined cards.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createLegacySplitPlantGeometry(layout) {
    const { frame, negative, positive, cards } = layout;
    const makeTop = (z0, z1) => {
        const geometry = cards.fullTop.clone();
        const positions = geometry.attributes.position, uv = geometry.attributes.uv;
        for (let i = 0; i < positions.count; i++) {
            const z = i < 2 ? z0 : z1;
            positions.setZ(i, z);
            uv.setY(i, (frame.maxZ - z) / (frame.maxZ - frame.minZ));
        }
        return geometry;
    };
    const left = makeTop(frame.minZ, negative), right = makeTop(positive, frame.maxZ);
    const geometry = mergeGeometries([cards.leftV, cards.rightV, left, right]);
    left.dispose(); right.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}
