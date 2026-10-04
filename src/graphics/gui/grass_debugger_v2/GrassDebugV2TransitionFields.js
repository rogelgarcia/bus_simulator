// Batch four large grass fields into one-metre selection cells with borrowed textures and materials.
// @ts-check
import * as THREE from 'three';
import { cloneMaterialShaderContract, registerMaterialShaderHook } from '../../shaders/core/MaterialShaderHookRegistry.js';
import { attachShaderMetadata } from '../../shaders/core/ShaderLoader.js';
import { grassTransitionFieldUvShader, grassTransitionFieldCanopyShader } from '../../shaders/materials/grass/GrassTransitionFieldShaderLoader.js';
import { createGrassTransitionBlendMaterials } from './GrassDebugV2TransitionBlend.js?v=transition-blend-startup-1';
import { createGrassTransitionChunks } from './GrassDebugV2TransitionChunks.js';
import { grassTransitionCanopyProfile, createGrassTransitionCanopyGeometry } from './GrassDebugV2TransitionCanopy.js';

const LEVELS = Object.freeze(['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4']);
const TEMPLATE_CENTERS = Object.freeze([[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]);

function sourceLeaves(mesh) {
    const geometry = mesh.geometry, { position, uv } = geometry.attributes, index = geometry.index;
    return mesh.userData.grassLeafRanges.map(({ start, count }, id) => {
        const vertices = new Set();
        let minimum = Infinity, x = 0, z = 0, roots = 0;
        for (let i = start; i < start + count; i++) { const v = index.getX(i); vertices.add(v); minimum = Math.min(minimum, uv.getY(v)); }
        for (const v of vertices) if (uv.getY(v) <= minimum + 1e-6) {
            x += position.getX(v); z += position.getZ(v); roots++;
        }
        return { id, start, count, x: x / roots, z: z / roots };
    });
}

function templateIndex(x, z) {
    return x >= -1 && x < 1 && z >= -1 && z < 1 ? (x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0) : -1;
}

function selectGeometry(source, leaves, centerX = 0, centerZ = 0) {
    const geometry = new THREE.BufferGeometry(), vertices = [], remap = new Map(), indices = [], ranges = [];
    for (const leaf of leaves) {
        const start = indices.length;
        for (let i = leaf.start; i < leaf.start + leaf.count; i++) {
            const id = source.index.getX(i);
            if (!remap.has(id)) { remap.set(id, vertices.length); vertices.push(id); }
            indices.push(remap.get(id));
        }
        ranges.push({ start, count: leaf.count, x: leaf.x - centerX, z: leaf.z - centerZ });
    }
    for (const [name, attribute] of Object.entries(source.attributes)) {
        const selected = new THREE.BufferAttribute(new attribute.array.constructor(vertices.length * attribute.itemSize), attribute.itemSize, attribute.normalized);
        vertices.forEach((id, i) => selected.copyAt(i, attribute, id));
        geometry.setAttribute(name, selected);
    }
    geometry.setIndex(indices); geometry.translate(-centerX, 0, -centerZ);
    geometry.userData.grassLeafCount = leaves.length;
    geometry.userData.grassLeafRanges = ranges;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

function detailTemplates(detail) {
    const groups = TEMPLATE_CENTERS.map(() => []);
    detail.group.updateMatrixWorld(true);
    for (const mesh of detail.group.children) {
        const { position } = mesh.geometry.attributes;
        for (let start = 0; start < position.count; start += 6) {
            const x = (position.getX(start) + position.getX(start + 2)) * detail.decode.x / 2 + mesh.position.x;
            const z = (position.getZ(start) + position.getZ(start + 2)) * detail.decode.z / 2 + mesh.position.z;
            const quadrant = templateIndex(x, z);
            if (quadrant >= 0) groups[quadrant].push({ mesh, start });
        }
    }
    return groups.map((leaves, quadrant) => {
        if (!leaves.length) throw new Error('LOD3 transition template is empty: ' + quadrant);
        const geometry = new THREE.BufferGeometry(), source = leaves[0].mesh.geometry;
        for (const [name, attribute] of Object.entries(source.attributes)) {
            const selected = new THREE.BufferAttribute(new attribute.array.constructor(leaves.length * 6 * attribute.itemSize), attribute.itemSize, attribute.normalized);
            leaves.forEach(({ mesh, start }, leaf) => {
                for (let i = 0; i < 6; i++) selected.copyAt(leaf * 6 + i, mesh.geometry.attributes[name], start + i);
            });
            geometry.setAttribute(name, selected);
        }
        const position = geometry.attributes.position, [cx, cz] = TEMPLATE_CENTERS[quadrant], bounds = new THREE.Box3();
        const point = new THREE.Vector3();
        leaves.forEach(({ mesh, start }, leaf) => {
            const original = mesh.geometry.attributes.position;
            for (let i = 0; i < 6; i++) {
                point.set(original.getX(start + i) * detail.decode.x + mesh.position.x - cx,
                    original.getY(start + i) * detail.decode.y + mesh.position.y,
                    original.getZ(start + i) * detail.decode.z + mesh.position.z - cz);
                position.setXYZ(leaf * 6 + i, point.x / detail.decode.x, point.y / detail.decode.y, point.z / detail.decode.z);
                bounds.expandByPoint(point);
            }
        });
        geometry.boundingBox = bounds.expandByScalar(Math.max(...detail.decode.toArray()) / 32767);
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        geometry.userData.grassLeafCount = leaves.length;
        return geometry;
    });
}

function surfaceGeometry(height, ramp = 0, edgeMask = null) {
    const axis = ramp ? [-.5, -.5 + ramp, 0, .5 - ramp, .5] : [-.5, .5];
    const xAxis = edgeMask === null ? axis : [-.5, ...(edgeMask & 1 ? [-.5 + ramp] : []), ...(edgeMask & 2 ? [.5 - ramp] : []), .5];
    const zAxis = edgeMask === null ? axis : [-.5, ...(edgeMask & 4 ? [-.5 + ramp] : []), ...(edgeMask & 8 ? [.5 - ramp] : []), .5];
    const positions = [], uvs = [], indices = [];
    for (const z of zAxis) for (const x of xAxis) { positions.push(x, height, z); uvs.push(x + .5, .5 - z); }
    for (let z = 0; z < zAxis.length - 1; z++) for (let x = 0; x < xAxis.length - 1; x++) {
        const a = z * xAxis.length + x, b = a + xAxis.length;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (ramp) { geometry.boundingBox.min.y = 0; geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere()); }
    return geometry;
}

function surfaceMaterial(source, uvMatrix, bounds = null, shape = null) {
    const material = cloneMaterialShaderContract(source);
    material.userData = { ...source.userData };
    const uniforms = { grassTransitionUvMatrix: { value: uvMatrix } };
    if (bounds) {
        material.defines = { ...material.defines, GRASS_TRANSITION_CANOPY: 1 };
        uniforms.grassTransitionFieldBounds = { value: new THREE.Vector4(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ) };
        uniforms.grassTransitionCanopyShape = { value: new THREE.Vector2(shape.height, shape.ramp) };
    }
    attachShaderMetadata(material, grassTransitionFieldUvShader);
    if (bounds) attachShaderMetadata(material, grassTransitionFieldCanopyShader);
    registerMaterialShaderHook(material, { id: 'grass.transition-field.surface', priority: 90,
        variantKey: grassTransitionFieldUvShader.variantKey + (bounds ? grassTransitionFieldCanopyShader.variantKey : ''), uniforms,
        apply(shader) {
            if (!shader.vertexShader.includes('#include <uv_vertex>') || !shader.vertexShader.includes('#include <begin_vertex>'))
                throw new Error('Transition surface shader contract changed.');
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + grassTransitionFieldUvShader.fragmentSource)
                .replace('#include <uv_vertex>', grassTransitionFieldUvShader.vertexSource);
            if (bounds) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + grassTransitionFieldCanopyShader.vertexSource);
        }
    });
    return material;
}

function boundaryMask(x, z, size) {
    return (x === 0 ? 1 : 0) | (x === size - 1 ? 2 : 0) | (z === 0 ? 4 : 0) | (z === size - 1 ? 8 : 0);
}

/**
 * Source geometry and textures remain owned by the caller. Selection updates are explicit; there is no frame callback.
 * @param {{sources:Record<string,THREE.Mesh|THREE.Group>,detail:object,canopy:object,litterMaterial?:THREE.Material,
 * soilMaterial:THREE.Material,soilUv:THREE.Matrix3,litterUv?:THREE.Matrix3,fieldSize?:number,gap?:number}} options
 */
export function createGrassDebugV2TransitionFields({ sources, detail, canopy, litterMaterial, soilMaterial, soilUv, litterUv, fieldSize = 32, gap = 1 }) {
    if (!Number.isInteger(fieldSize) || fieldSize < 2 || fieldSize % 2 || !(gap > 0) || !Number.isFinite(gap)
        || !soilMaterial?.isMaterial || !soilUv?.isMatrix3 || (litterMaterial && !litterUv?.isMatrix3)
        || !detail?.decode?.isVector3 || !detail.group?.isGroup || !canopy?.materials?.all)
        throw new Error('Transition fields require even metre dimensions, positive gaps and complete source materials/mappings.');
    for (const lod of LEVELS.slice(0, 3)) {
        const mesh = sources[lod];
        if (!mesh?.isMesh || Array.isArray(mesh.material) || !mesh.geometry?.index || !mesh.geometry.attributes.uv
            || !mesh.userData.grassLeafRanges?.length) throw new Error('Transition fields require indexed leaf ranges for ' + lod);
    }
    const started = performance.now(), group = new THREE.Group(); group.name = 'GrassTransitionFields';
    const geometries = new Set(), materials = new Set(), templates = {}, allBatches = [], fields = [], cells = [], matrix = new THREE.Matrix4();
    const canopyShape = canopy.getSnapshot().definition;
    const blendMaterials = createGrassTransitionBlendMaterials(), blendBatches = new Map();
    for (const lod of LEVELS.slice(0, 3)) {
        const source = sources[lod], leaves = sourceLeaves(source);
        templates[lod] = TEMPLATE_CENTERS.map(([cx, cz], quadrant) => {
            const selected = leaves.filter(leaf => templateIndex(leaf.x, leaf.z) === quadrant);
            if (!selected.length) throw new Error('Empty transition source template: ' + lod + '/' + quadrant);
            return selectGeometry(source.geometry, selected, cx, cz);
        });
    }
    templates.LOD3 = detailTemplates(detail);
    const canopyGeometry = surfaceGeometry(canopyShape.height, canopyShape.ramp), flatCanopyGeometry = surfaceGeometry(canopyShape.height), groundCanopyGeometry = surfaceGeometry(0), groundGeometry = surfaceGeometry(litterMaterial ? .005 : 0);
    templates.LOD4 = TEMPLATE_CENTERS.map(() => canopyGeometry);
    Object.values(templates).flat().forEach(geometry => geometries.add(geometry)); geometries.add(groundGeometry); geometries.add(flatCanopyGeometry); geometries.add(groundCanopyGeometry);
    const soil = surfaceMaterial(soilMaterial, soilUv), litter = litterMaterial ? surfaceMaterial(litterMaterial, litterUv) : soil;
    materials.add(soil); materials.add(litter);
    function batch(geometry, material, capacity, name, parent, castShadow = false) {
        const mesh = new THREE.InstancedMesh(geometry, material, capacity);
        mesh.name = name; mesh.count = 0; mesh.visible = false; mesh.castShadow = castShadow; mesh.receiveShadow = true;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        parent.add(mesh);
        const result = { mesh, members: [], pending: [] }; allBatches.push(result); return result;
    }
    for (let field = 0; field < 4; field++) {
        const minX = field % 2 ? gap / 2 : -fieldSize - gap / 2, minZ = field >= 2 ? gap / 2 : -fieldSize - gap / 2;
        const bounds = Object.freeze({ minX, minZ, maxX: minX + fieldSize, maxZ: minZ + fieldSize });
        const node = new THREE.Group(); node.name = 'GrassTransitionField_' + field; group.add(node);
        const canopyUv = new THREE.Matrix3().set(1 / canopyShape.tileMeters, 0, .5 - (minX + 1) / canopyShape.tileMeters,
            0, -1 / canopyShape.tileMeters, .5 + (minZ + 1) / canopyShape.tileMeters, 0, 0, 1);
        const canopyMaterial = surfaceMaterial(canopy.materials.all, canopyUv, bounds, canopyShape); materials.add(canopyMaterial);
        const flatCanopyMaterial = surfaceMaterial(canopy.materials.all, canopyUv); materials.add(flatCanopyMaterial);
        const originalCanopyMaterial = cloneMaterialShaderContract(canopyMaterial), originalFlatCanopyMaterial = cloneMaterialShaderContract(flatCanopyMaterial);
        for (const material of [originalCanopyMaterial, originalFlatCanopyMaterial]) {
            delete material.defines.GRASS_CANOPY_BAKED_SHADOW_ONLY; materials.add(material);
        }
        const batches = LEVELS.map((lod, level) => TEMPLATE_CENTERS.map((_, quadrant) => {
            const material = level === 4 ? canopyMaterial : level === 3 ? detail.material : sources[lod].material;
            const capacity = fieldSize * fieldSize / 4;
            const geometry = level === 4 ? templates[lod][quadrant].clone() : templates[lod][quadrant];
            if (level === 4) {
                geometry.setAttribute('grassTransitionOpenEdges', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
                    .setUsage(THREE.DynamicDrawUsage));
                geometries.add(geometry);
            }
            const entry = batch(geometry, material, capacity, node.name + '-' + lod + '-' + quadrant, node, level < 3);
            if (level === 4) entry.canopyGeometry = geometry;
            entry.mesh.userData.grassTransitionLevel = level;
            if (level === 4) entry.mesh.userData.grassCanopy = true;
            else entry.mesh.userData.grassLeafCount = templates[lod][quadrant].userData.grassLeafCount;
            return entry;
        }));
        // World-space UVs let every interior cell share one batch, regardless of source quadrant.
        const interior = batch(flatCanopyGeometry, flatCanopyMaterial, fieldSize * fieldSize, node.name + '-LOD4-Interior', node);
        Object.assign(interior.mesh.userData, { grassTransitionLevel: 4, grassCanopy: true, grassCanopyInterior: true });
        const ground = batch(groundGeometry, litter, fieldSize * fieldSize, node.name + '-Ground', node), fringes = new Map();
        ground.mesh.userData.grassTransitionGround = true;
        for (let z = 0; z < fieldSize; z++) for (let x = 0; x < fieldSize; x++) {
            const quadrant = x % 2 + 2 * (z % 2), edge = boundaryMask(x, z, fieldSize), id = cells.length;
            cells.push(Object.freeze({ id, field, x, z, template: quadrant, edge, centerX: minX + x + .5, centerZ: minZ + z + .5,
                minX: minX + x, maxX: minX + x + 1, minZ: minZ + z, maxZ: minZ + z + 1 }));
            if (edge && !fringes.has(quadrant + ':' + edge)) {
                const source = templates.LOD2[quadrant];
                const leaves = source.userData.grassLeafRanges.filter(leaf => edge & 1 && leaf.x < -.5 + canopyShape.edgeWidth
                    || edge & 2 && leaf.x > .5 - canopyShape.edgeWidth || edge & 4 && leaf.z < -.5 + canopyShape.edgeWidth
                    || edge & 8 && leaf.z > .5 - canopyShape.edgeWidth);
                const geometry = selectGeometry(source, leaves); geometries.add(geometry);
                const fringe = batch(geometry, sources.LOD2.material, fieldSize, node.name + '-Fringe-' + quadrant + '-' + edge, node);
                fringe.mesh.userData.grassLeafCount = leaves.length; fringes.set(quadrant + ':' + edge, fringe);
            }
        }
        fields.push({ index: field, bounds, node, batches, interior, ground, fringes, strips: new Map(), canopyMaterial, flatCanopyMaterial,
            originalCanopyMaterial, originalFlatCanopyMaterial });
    }
    const levels = new Uint8Array(cells.length).fill(255), publicCells = Object.freeze(cells), fieldBounds = Object.freeze(fields.map(field => field.bounds));
    const sideLeaves = new Uint8Array(cells.length).fill(1);
    const renderMasks = new Uint8Array(cells.length), canopyLevels = new Uint8Array(cells.length);
    const chunks = createGrassTransitionChunks({ parent: group, entries: allBatches, cells, fieldSize });
    let soilOnly = false, flatLod4 = false, disposed = false, scans = 0, uploads = 0, lastApplyMilliseconds = 0, totalApplyMilliseconds = 0;
    let lod4Surface = 'beveled';
    let optimization = 'optimized';
    let materialTransform = material => material;
    let edgeStrips = false;
    let selectedCounts = [0, 0, 0, 0, 0];
    function route(entry, id, mixed, level) {
        if (!mixed) { entry.pending.push(id); return; }
        let target = blendBatches.get(entry);
        if (!target) {
            const geometry = entry.mesh.geometry.attributes.grassTransitionOpenEdges ? entry.mesh.geometry.clone() : entry.mesh.geometry;
            if (geometry !== entry.mesh.geometry) geometries.add(geometry);
            target = batch(geometry, blendMaterials.material(entry.mesh.material, level), entry.mesh.instanceMatrix.count,
                entry.mesh.name + '-Blend', entry.mesh.parent);
            target.mesh.userData = { ...entry.mesh.userData, grassTransitionBlend: true, grassTransitionBlendLevel: level };
            target.sourceGeometry = entry.mesh.geometry;
            blendBatches.set(entry, target);
        }
        if (target.sourceGeometry !== entry.mesh.geometry) {
            target.sourceGeometry = entry.mesh.geometry;
            target.mesh.geometry = entry.mesh.geometry.attributes.grassTransitionOpenEdges ? entry.mesh.geometry.clone() : entry.mesh.geometry;
            if (target.mesh.geometry !== entry.mesh.geometry) geometries.add(target.mesh.geometry);
            target.members = []; // Force fresh bounds after switching surface shape.
        }
        target.mesh.material = blendMaterials.material(entry.mesh.material, level);
        target.mesh.position.copy(entry.mesh.position);
        target.pending.push(id);
    }
    function rebuild() {
        const before = performance.now();
        allBatches.forEach(entry => { entry.pending = []; });
        selectedCounts = [0, 0, 0, 0, 0];
        for (const field of fields) {
            field.ground.mesh.material = soilOnly ? soil : litter;
            field.ground.mesh.position.y = soilOnly && litterMaterial ? -.005 : 0;
        }
        for (const cell of cells) {
            const field = fields[cell.field], mask = renderMasks[cell.id], mixed = (mask & (mask - 1)) !== 0;
            selectedCounts[levels[cell.id]]++;
            if (soilOnly) { field.ground.pending.push(cell.id); continue; }
            // Elevated canopy and floor footprints differ at oblique angles. Keep litter underneath
            // the band so their projected patch edges cannot expose holes.
            if (mask & 15) field.ground.pending.push(cell.id);
            for (let level = 0; level < 5; level++) {
                if (!(mask & (1 << level))) continue;
                const profile = level === 4 && edgeStrips && optimization === 'optimized' && !flatLod4
                    ? grassTransitionCanopyProfile(cell, canopyLevels, fieldSize) : 0;
                // Shape changes sit outside visible blend support, so cache updates cannot pop the ramp.
                const interior = level === 4 && optimization === 'optimized' && lod4Surface === 'beveled' && !cell.edge
                    && canopyLevels[cell.id - 1] === 4 && canopyLevels[cell.id + 1] === 4
                    && canopyLevels[cell.id - fieldSize] === 4 && canopyLevels[cell.id + fieldSize] === 4 && !profile;
                let entry = interior ? field.interior : field.batches[level][cell.template];
                if (edgeStrips && level === 4 && !interior && optimization === 'optimized' && !flatLod4) {
                    if (!field.strips.has(profile)) {
                        const geometry = createGrassTransitionCanopyGeometry(profile, canopyShape);
                        geometries.add(geometry);
                        const strip = batch(geometry, materialTransform(field.flatCanopyMaterial), fieldSize * fieldSize, field.node.name + '-LOD4-Strip-' + profile, field.node);
                        Object.assign(strip.mesh.userData, { grassTransitionLevel: 4, grassCanopy: true, grassCanopyStrip: true });
                        field.strips.set(profile, strip);
                    }
                    entry = field.strips.get(profile);
                }
                route(entry, cell.id, mixed, level);
                if (level === 4 && cell.edge && sideLeaves[cell.id]) route(field.fringes.get(cell.template + ':' + cell.edge), cell.id, mixed, 4);
            }
        }
        for (const entry of allBatches) {
            const changed = entry.members.length !== entry.pending.length || entry.members.some((id, i) => id !== entry.pending[i]);
            const openEdges = entry.mesh.geometry.attributes.grassTransitionOpenEdges;
            if (openEdges) {
                let edgesChanged = false;
                entry.pending.forEach((id, i) => {
                    const cell = cells[id];
                    const adjacent = [cell.x > 0 ? id - 1 : -1, cell.x < fieldSize - 1 ? id + 1 : -1,
                        cell.z > 0 ? id - fieldSize : -1, cell.z < fieldSize - 1 ? id + fieldSize : -1];
                    adjacent.forEach((neighbor, side) => {
                        const value = neighbor >= 0 && canopyLevels[neighbor] < 4 ? 1 : 0;
                        const offset = i * 4 + side;
                        if (openEdges.array[offset] !== value) { openEdges.array[offset] = value; edgesChanged = true; }
                    });
                });
                if (edgesChanged) { openEdges.needsUpdate = true; uploads++; }
            }
            if (!changed) continue;
            entry.members = entry.pending; entry.mesh.count = entry.members.length; entry.mesh.visible = entry.members.length > 0;
            entry.members.forEach((id, i) => {
                const cell = cells[id]; matrix.makeTranslation(cell.centerX, 0, cell.centerZ); entry.mesh.setMatrixAt(i, matrix);
            });
            entry.mesh.instanceMatrix.needsUpdate = true; uploads++;
            entry.mesh.computeBoundingBox(); entry.mesh.computeBoundingSphere();
        }
        chunks.sync();
        lastApplyMilliseconds = performance.now() - before; totalApplyMilliseconds += lastApplyMilliseconds;
    }
    function updateCanopyMaterials() {
        for (const field of fields) {
            const flat = optimization === 'original' ? field.originalFlatCanopyMaterial : field.flatCanopyMaterial;
            const beveled = optimization === 'original' ? field.originalCanopyMaterial : field.canopyMaterial;
            field.interior.mesh.material = materialTransform(flat);
            for (const entry of field.strips.values()) entry.mesh.material = materialTransform(flat);
            for (const entry of field.batches[4]) {
                entry.mesh.geometry = lod4Surface === 'ground' ? groundCanopyGeometry : flatLod4 ? flatCanopyGeometry : entry.canopyGeometry;
                entry.mesh.material = materialTransform(flatLod4 ? flat : beveled);
                entry.mesh.computeBoundingBox(); entry.mesh.computeBoundingSphere();
            }
        }
    }
    const buildMilliseconds = performance.now() - started;
    const api = {
        group, cells: publicCells, bounds: fieldBounds,
        setChunkSize: chunks.setSize,
        configureBlend: blendMaterials.configure,
        setEdgeStrips(value) {
            if (typeof value !== 'boolean') throw new Error('Edge-strip selection requires a boolean.');
            if (value === edgeStrips) return;
            edgeStrips = value; rebuild();
        },
        setMaterialTransform(transform) {
            if (typeof transform !== 'function') throw new Error('Canopy material transform must be a function.');
            materialTransform = transform; updateCanopyMaterials(); chunks.sync();
        },
        /** Original keeps both pre-optimization shader and grids; shadow keeps grids with only the shadow fix.
         * @param {'original'|'shadow'|'optimized'} value */
        setOptimization(value) {
            if (disposed || !['original', 'shadow', 'optimized'].includes(value)) throw new Error('Unknown LOD4 optimization: ' + value);
            if (value === optimization) return;
            optimization = value; updateCanopyMaterials(); rebuild();
        },
        /** @param {boolean} value */
        setFlatLod4(value) {
            if (disposed || typeof value !== 'boolean') throw new Error('Flat LOD4 requires a live renderer and a boolean.');
            api.setLod4Surface(value ? 'flat' : 'beveled');
        },
        /** @param {'beveled'|'flat'|'ground'} value */
        setLod4Surface(value) {
            if (disposed || !['beveled', 'flat', 'ground'].includes(value)) throw new Error('Unknown LOD4 surface: ' + value);
            if (value === lod4Surface) return;
            lod4Surface = value; flatLod4 = value !== 'beveled';
            updateCanopyMaterials(); rebuild();
        },
        /** @param {Uint8Array} next @param {Uint8Array|null} [nextSideLeaves] @param {Uint8Array|null} [nextMasks] */
        applyLevels(next, nextSideLeaves = null, nextMasks = null) {
            if (disposed) throw new Error('Transition fields were disposed.');
            if (!(next instanceof Uint8Array) || next.length !== cells.length || next.some(level => level > 4))
                throw new Error('Transition levels must be a Uint8Array containing one LOD index 0â€“4 for every cell.');
            if (nextSideLeaves !== null && (!(nextSideLeaves instanceof Uint8Array) || nextSideLeaves.length !== cells.length
                || nextSideLeaves.some(value => value > 1))) throw new Error('Side-leaf visibility requires one 0/1 value per cell.');
            if (nextMasks !== null && (!(nextMasks instanceof Uint8Array) || nextMasks.length !== cells.length
                || nextMasks.some((mask, i) => mask < 1 || mask > 31 || !(mask & (1 << next[i])))))
                throw new Error('Grass render masks must contain the dominant level and only LOD0–4.');
            const masksChanged = renderMasks.some((mask, i) => mask !== (nextMasks ? nextMasks[i] : 1 << next[i]));
            scans++;
            const sidesChanged = nextSideLeaves !== null && nextSideLeaves.some((value, i) => value !== sideLeaves[i]);
            if (next.every((level, i) => level === levels[i]) && !sidesChanged && !masksChanged) { lastApplyMilliseconds = 0; return false; }
            if (nextSideLeaves !== null) sideLeaves.set(nextSideLeaves);
            levels.set(next);
            for (let i = 0; i < cells.length; i++) {
                renderMasks[i] = nextMasks ? nextMasks[i] : 1 << next[i];
                canopyLevels[i] = renderMasks[i] & 16 ? 4 : 3;
            }
            rebuild(); return true;
        },
        /** @param {boolean} value */
        setSoilOnly(value) {
            if (disposed || typeof value !== 'boolean') throw new Error('Soil-only mode requires a live renderer and a boolean.');
            if (soilOnly === value) return;
            soilOnly = value; rebuild();
        },
        getSnapshot() {
            const active = [...allBatches.filter(entry => entry.mesh.visible), ...chunks.getMeshes().map(mesh => ({ mesh }))], triangles = active.reduce((sum, entry) => sum
                + entry.mesh.count * (entry.mesh.geometry.index?.count ?? entry.mesh.geometry.attributes.position.count) / 3, 0);
            const geometryBytes = chunks.getSnapshot().geometryBytes + [...geometries].reduce((sum, geometry) => sum + (geometry.index?.array.byteLength ?? 0)
                + Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0), 0);
            return { fields: fields.map(field => ({ index: field.index, ...field.bounds })), fieldSize, gap, selectionCellMeters: 1,
                cells: cells.length, levels: [...selectedCounts], soilOnly, flatLod4, lod4Surface, optimization, edgeStrips, activeBatches: active.length, mainBatchCapacity: allBatches.length,
                lod4InteriorCells: fields.reduce((sum, field) => sum + field.interior.mesh.count, 0),
                lod4GridCells: flatLod4 ? 0 : fields.reduce((sum, field) => sum + field.batches[4].reduce((n, entry) => n + entry.mesh.count, 0), 0),
                triangles, geometryBytes, chunks: chunks.getSnapshot(), instanceBytes: allBatches.reduce((sum, entry) => sum + entry.mesh.instanceMatrix.array.byteLength, 0) + chunks.getSnapshot().instanceBytes,
                templateLeaves: Object.fromEntries(LEVELS.slice(0, 4).map(lod => [lod, templates[lod].map(geometry => geometry.userData.grassLeafCount)])),
                blendCandidateCells: renderMasks.reduce((sum, mask) => sum + Number((mask & (mask - 1)) !== 0), 0),
                blendBatches: active.filter(entry => entry.mesh.userData.grassTransitionBlend).length,
                extraTextureBytes: 0, buildMilliseconds, selectionScans: scans, instanceUploads: uploads, lastApplyMilliseconds, totalApplyMilliseconds,
                sideLeafCells: fields.reduce((sum, field) => sum + [...field.fringes.values()].reduce((count, fringe) => count + fringe.mesh.count, 0), 0),
                perimeterPolicy: 'LOD2 fringe only on true field edges; canopy meets litter along exposed internal edges', groundLayersPerCell: renderMasks.some(mask => (mask & 16) && (mask & 15)) && !soilOnly ? 2 : 1 };
        },
        dispose() {
            if (disposed) return;
            disposed = true; group.removeFromParent(); allBatches.forEach(entry => entry.mesh.dispose());
            chunks.dispose(); blendMaterials.dispose(); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); group.clear();
        }
    };
    api.applyLevels(new Uint8Array(cells.length).fill(4));
    return Object.freeze(api);
}
