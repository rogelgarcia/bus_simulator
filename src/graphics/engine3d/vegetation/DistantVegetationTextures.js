// Shares identical canopy maps across loaded GLBs and releases them after the last tree is disposed.
// @ts-check
const pools = new WeakMap();

/** @param {any} root @param {any} record @param {object} renderer */
export function shareDistantVegetationTextures(root, record, renderer) {
    let pool = pools.get(renderer);
    if (!pool) { pool = new Map(); pools.set(renderer, pool); }
    const acquired = new Map(), replaced = new Set();
    root.traverse(object => {
        if (!object.isMesh) return;
        for (const [key, texture] of Object.entries(object.material)) {
            if (!texture?.isTexture || !texture.name.startsWith('shared_leaf_')) continue;
            const report = record.compression.find(item => item.name === texture.name);
            if (!report) throw new Error('Shared canopy texture is missing its authenticated identity');
            let entry = acquired.get(report.sha256);
            if (!entry) {
                entry = pool.get(report.sha256);
                if (!entry) { entry = { texture, users: 0 }; pool.set(report.sha256, entry); }
                entry.users++; acquired.set(report.sha256, entry);
            }
            if (entry.texture !== texture) replaced.add(texture);
            object.material[key] = entry.texture;
        }
    });
    for (const texture of replaced) texture.dispose();
    return {
        textures: new Set([...acquired.values()].map(entry => entry.texture)),
        release() {
            for (const [id, entry] of acquired) {
                entry.users--;
                if (!entry.users) { entry.texture.dispose(); pool.delete(id); }
            }
            acquired.clear();
        }
    };
}
