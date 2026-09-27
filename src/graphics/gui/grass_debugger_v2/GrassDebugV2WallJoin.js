// Join each side projection to the corresponding uncropped top-bake edge.
// @ts-check
import * as THREE from 'three';
import { createGrassAlphaCoverageMipmaps } from './GrassDebugV2AlphaCoverage.js';
import { GRASS_V2_SIDE_ALPHA_TEST } from './GrassDebugV2SideBake.js';

/**
 * @param {{sideBake:Awaited<ReturnType<import('./GrassDebugV2SideBake.js').createGrassDebugV2SideBake>>,
 * topBake:Awaited<ReturnType<import('./GrassDebugV2FloorBake.js').createGrassDebugV2FloorBake>>,wallHeight:number}} options
 */
export function createGrassDebugV2WallJoin({ sideBake, topBake, wallHeight }) {
    const topSize = topBake.getSnapshot().resolution;
    const top = Object.fromEntries(['albedo', 'normal', 'roughness'].map(name => [name, topBake.readPixels(name)]));
    const blendHeight = 0.008, textures = [];
    const sample = (data, u, v, result) => {
        const x = THREE.MathUtils.clamp(u * topSize - 0.5, 0, topSize - 1);
        const y = THREE.MathUtils.clamp(v * topSize - 0.5, 0, topSize - 1);
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const x1 = Math.min(x0 + 1, topSize - 1), y1 = Math.min(y0 + 1, topSize - 1);
        for (let c = 0; c < 3; c++) result[c] = THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(data[(y0 * topSize + x0) * 4 + c], data[(y0 * topSize + x1) * 4 + c], fx),
            THREE.MathUtils.lerp(data[(y1 * topSize + x0) * 4 + c], data[(y1 * topSize + x1) * 4 + c], fx), fy);
    };
    const views = sideBake.views.map(view => {
        const { width, height } = view.textures.albedo.image;
        const data = Object.fromEntries(Object.entries(view.textures).map(([name, texture]) => [name, texture.image.data.slice()]));
        const sourceAlpha = view.textures.albedo.image.data;
        const joinRows = Math.max(2, Math.ceil(blendHeight / wallHeight * height));
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(view.quaternion);
        const inverse = view.quaternion.clone().invert(), edgeNormal = new THREE.Vector3(), blendedNormal = new THREE.Vector3();
        const color = [0, 0, 0], normal = [0, 0, 0], roughness = [0, 0, 0];
        const joinStarts = new Uint16Array(width);
        for (let x = 0; x < width; x++) {
            // Continue the top's border down through the empty band to the first solid blade.
            let end = height - 1;
            while (end > 0 && sourceAlpha[(end * width + x) * 4 + 3] < 192) end--;
            end = Math.max(joinRows, end);
            const start = Math.max(0, end - joinRows); joinStarts[x] = start;
            const along = (x + 0.5) / width - 0.5;
            for (let y = start + 1; y < height; y++) {
                const i = (y * width + x) * 4, weight = THREE.MathUtils.smoothstep(y, start, end);
                const down = (height - 1 - y) / (height - 1) * wallHeight;
                const worldX = right.x * along + view.outward.x * (0.5 - down);
                const worldZ = right.z * along + view.outward.z * (0.5 - down);
                const u = worldX + 0.5, v = 0.5 - worldZ;
                sample(top.albedo, u, v, color); sample(top.normal, u, v, normal); sample(top.roughness, u, v, roughness);
                if (topBake.textures.roughness.userData.grassSoilContributions) roughness[0] = roughness[2] = roughness[1];
                // Floor tangent axes are +X, -Z, +Y; preserve the world normal across the corner.
                edgeNormal.set(normal[0] / 127.5 - 1, normal[2] / 127.5 - 1, -(normal[1] / 127.5 - 1))
                    .normalize().applyQuaternion(inverse);
                const sideWeight = sourceAlpha[i + 3] / 255 * (1 - weight), alpha = sideWeight + weight;
                for (let c = 0; c < 3; c++) {
                    data.albedo[i + c] = Math.round((data.albedo[i + c] * sideWeight + color[c] * weight) / alpha);
                    data.roughness[i + c] = Math.round((data.roughness[i + c] * sideWeight + roughness[c] * weight) / alpha);
                }
                blendedNormal.fromArray(data.normal, i).multiplyScalar(1 / 127.5).subScalar(1)
                    .multiplyScalar(sideWeight).addScaledVector(edgeNormal, weight).normalize();
                for (let c = 0; c < 3; c++) data.normal[i + c] = Math.round((blendedNormal.getComponent(c) + 1) * 127.5);
                for (const name of ['albedo', 'normal', 'roughness']) data[name][i + 3] = Math.round(alpha * 255);
            }
        }
        const maps = Object.fromEntries(Object.entries(view.textures).map(([name, original]) => {
            const texture = original.clone(); texture.source = new THREE.Source({ data: data[name], width, height });
            texture.name = original.name + '-TopJoin';
            if (name === 'albedo') texture.mipmaps = createGrassAlphaCoverageMipmaps(data[name], width, height, { alphaTest: GRASS_V2_SIDE_ALPHA_TEST });
            texture.needsUpdate = true; textures.push(texture); return [name, texture];
        }));
        return Object.freeze({ ...view, textures: Object.freeze(maps), joinStarts });
    });
    return Object.freeze({ views: Object.freeze(views), blendHeight,
        dispose: () => textures.forEach(texture => texture.dispose()) });
}
