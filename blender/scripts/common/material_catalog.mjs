// Exposes the installed game's PBR catalog to Blender and source-preparation scripts.
import { PBR_MATERIAL_CATALOG } from '../../../assets/public/pbr/_catalog_index.js';

const ids = new Set();
for (const entry of PBR_MATERIAL_CATALOG) {
    if (ids.has(entry.materialId)) throw new Error(`Duplicate PBR material: ${entry.materialId}`);
    ids.add(entry.materialId);
}
process.stdout.write(JSON.stringify(PBR_MATERIAL_CATALOG));
