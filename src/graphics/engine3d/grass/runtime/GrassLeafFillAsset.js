// Load an authenticated offline directional leaf-fill experiment without runtime projection or capture.
// @ts-check
import * as THREE from 'three';

/** @param {{renderer:THREE.WebGLRenderer,sourceHash:string,root?:string}} options */
export async function loadGrassLeafFillAsset({ renderer, sourceHash, root = '/assets/public/grass/lod4_leaf_fill/' }) {
    const responses = await Promise.all(['manifest.json', 'leaves.rgba'].map(name => fetch(root + name)));
    if (responses.some(response => !response.ok)) throw new Error('[Grass] Leaf-fill assets missing. Bake materials/grass/lod4-leaf-fill with --publish.');
    const manifest = await responses[0].json(), buffer = await responses[1].arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n => n.toString(16).padStart(2, '0')).join('');
    if (manifest.schema !== 'bus-simulator.grass-leaf-fill' || manifest.version !== 1 || manifest.sourceHash !== sourceHash
        || manifest.views !== 8 || manifest.size !== 512 || manifest.tileSize !== 2 || !(manifest.extent > 1 && manifest.extent < 2)
        || manifest.elevation !== 20 || manifest.coordinateSystem !== 'tile-local-x-negative-z'
        || manifest.encoding !== 'linear-premultiplied-rgba8' || hash !== manifest.sha256 || buffer.byteLength !== manifest.bytes
        || buffer.byteLength !== manifest.size ** 2 * manifest.views * 4) throw new Error('[Grass] Invalid or stale leaf-fill assets.');
    const texture = new THREE.DataArrayTexture(new Uint8Array(buffer), manifest.size, manifest.size, manifest.views);
    texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); texture.needsUpdate = true;
    return Object.freeze({ texture, manifest, dispose() { texture.dispose(); } });
}
