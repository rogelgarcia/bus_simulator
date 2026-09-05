// Compares captured live source fields without allocating profiles or JSON strings every frame.
// @ts-check
import { getAuthoredMaterialShadowSide } from '../../lighting/MaterialShadowSideState.js';
const MATERIAL_FIELDS = ['opacity', 'visible', 'emissiveIntensity', 'metalness', 'roughness', 'normalMapType', 'bumpScale',
    'displacementScale', 'displacementBias', 'side', 'alphaTest', 'alphaHash', 'transparent', 'vertexColors', 'flatShading',
    'transmission', 'ior', 'thickness', 'attenuationDistance', 'clearcoat', 'clearcoatRoughness',
    'aoMapIntensity', 'lightMapIntensity', 'alphaToCoverage', 'depthTest', 'depthWrite', 'colorWrite',
    'blending', 'blendSrc', 'blendDst', 'blendEquation'];
const TEXTURE_SLOTS = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap',
    'displacementMap', 'lightMap', 'specularMap', 'specularColorMap', 'specularIntensityMap', 'transmissionMap', 'thicknessMap',
    'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap'];
const TEXTURE_FIELDS = ['version', 'format', 'type', 'internalFormat', 'mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter',
    'generateMipmaps', 'anisotropy', 'flipY', 'premultiplyAlpha', 'unpackAlignment', 'colorSpace', 'rotation', 'matrixAutoUpdate'];
const SEMANTICS = ['asphaltRoadBase', 'asphaltMarkingsNoiseBase', 'asphaltMarkingsNoiseConfig', 'asphaltEdgeWearConfig',
    'sidewalkEdgeDirtStripConfig', 'roadSurfaceVariationConfig', 'materialVariationConfig', 'uvTilingConfig',
    'groundSubstrateBlendConfig', 'roadMarkingsAsphaltNoiseConfig', 'roadMarkingsOverlayConfig', 'roadMarkingsOverlayEnabled',
    'smartMaterialGroupShader', 'windowFakeDepth', 'grassCardShaderConfig', 'grassCardShaderSignature', 'grassCardShaderVersion',
    'grassLodShaderVersion', 'buildingWindowMergeSafeShader', 'windowGlass', 'buildingWindowGlass', 'buildingWindowGlassEnabled',
    'iblEnvMapIntensity', 'iblEnvMapIntensityScale', 'preserveShadowSide', 'isFoliage',
    'asphaltMarkingsNoiseInjected', 'asphaltEdgeWearInjected', 'sidewalkEdgeDirtStripInjected'];

/** @param {Map<string, any>} references
 * @param {{roots?: any[], ignoreVisibility?: Set<any>}} options */
export function createEnhancedSourceWatch(references, { roots = [], ignoreVisibility = new Set() } = {}) {
    const fields = [], arrays = [], shapes = [], geometries = [], materials = new Set(), textures = new Set(), attributes = new Set(), visited = new Set(), capturedArrays = new Set();
    const field = (object, key) => fields.push([object, key, object[key]]);
    const array = (value) => { if (value && !capturedArrays.has(value)) { capturedArrays.add(value); arrays.push([value, Array.from(value)]); } };
    const components = (object, key, names) => {
        field(object, key);
        if (object[key]) for (const component of names) field(object[key], component);
    };
    const semantic = (object, key, ignoredKeys = null) => {
        field(object, key);
        const value = object[key];
        if (!value || typeof value !== 'object' || visited.has(value)) return;
        visited.add(value);
        if (value.isTexture) { textures.add(value); return; }
        if (ArrayBuffer.isView(value)) { array(value); return; }
        const keys = Object.keys(value).filter((key) => !key.startsWith('_') && key !== 'shaderUniforms' && !ignoredKeys?.includes(key));
        shapes.push([value, keys.length, true, ignoredKeys]);
        for (const nested of keys) semantic(value, nested);
    };
    for (const object of references.values()) {
        const geometry = object.geometry; geometries.push([object, geometry]);
        for (const key of ['parent', 'count', 'material', 'receiveShadow']) field(object, key);
        if (object.parent?.children) field(object.parent.children, 'length');
        if (Array.isArray(object.material)) array(object.material);
        field(object, 'matrixWorld'); field(object.matrixWorld, 'elements'); array(object.matrixWorld.elements);
        for (const key of ['instanceMatrix', 'instanceColor']) field(object, key);
        for (const attribute of [...Object.values(geometry.attributes), geometry.index, object.instanceMatrix, object.instanceColor]) if (attribute && !attributes.has(attribute)) {
            attributes.add(attribute);
            for (const key of ['version', 'array', 'count', 'itemSize', 'normalized', 'offset', 'data']) field(attribute, key);
            if (attribute.data) for (const key of ['version', 'array', 'stride']) field(attribute.data, key);
        }
        field(geometry, 'index'); field(geometry, 'attributes'); field(geometry, 'groups');
        components(geometry, 'drawRange', ['start', 'count']);
        array(geometry.groups);
        field(geometry.groups, 'length'); shapes.push([geometry.attributes, Object.keys(geometry.attributes).length]);
        for (const key of Object.keys(geometry.attributes)) field(geometry.attributes, key);
        for (const group of geometry.groups) for (const key of ['start', 'count', 'materialIndex']) field(group, key);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    const inventory = new Set();
    for (const root of roots) if (root.parent) { field(root.parent, 'children'); array(root.parent.children); }
    for (const root of roots) root.traverse((object) => {
        if (inventory.has(object)) return;
        inventory.add(object); field(object, 'parent'); field(object, 'children'); array(object.children);
        if (!ignoreVisibility.has(object)) field(object, 'visible');
    });
    const objectFields = fields.length;
    for (const material of materials) {
        for (const key of MATERIAL_FIELDS) field(material, key);
        for (const key of ['color', 'emissive', 'attenuationColor']) components(material, key, ['r', 'g', 'b']);
        components(material, 'normalScale', ['x', 'y']);
        semantic(material, 'defines', ['USE_CSM', 'CSM_CASCADES', 'CSM_FADE']); field(material, 'userData');
        if (material.userData) for (const key of SEMANTICS) semantic(material.userData, key);
        for (const key of TEXTURE_SLOTS) { field(material, key); if (material[key]) textures.add(material[key]); }
    }
    const materialFields = fields.length - objectFields;
    for (const texture of textures) {
        for (const key of TEXTURE_FIELDS) field(texture, key);
        components(texture, 'offset', ['x', 'y']); components(texture, 'repeat', ['x', 'y']); components(texture, 'center', ['x', 'y']);
        components(texture, 'source', ['data', 'version']);
        if (texture.matrixAutoUpdate === false) { field(texture, 'matrix'); field(texture.matrix, 'elements'); array(texture.matrix.elements); }
    }
    const monitor = createCapturedFieldWatch(fields);
    const shadowSides = [...materials].map((material) => [material, getAuthoredMaterialShadowSide(material)]);
    let geometryOverrides = new Map();
    const watch = (checkGeometry = false) => {
        if (!monitor.unchanged()) { watch.lastChange = monitor.describe(); return false; }
        for (const [object, count, semanticShape, ignoredKeys] of shapes) {
            let current = 0; for (const key in object) if (Object.hasOwn(object, key)
                && (!semanticShape || (!key.startsWith('_') && key !== 'shaderUniforms' && !ignoredKeys?.includes(key)))) current++;
            if (current !== count) { watch.lastChange = { kind: 'shape', expected: count, actual: current }; return false; }
        }
        for (let i = 0; i < arrays.length; i++) {
            const [value, previous] = arrays[i];
            if (value.length !== previous.length) { watch.lastChange = { kind: 'array_length' }; return false; }
            for (let c = 0; c < previous.length; c++) if (value[c] !== previous[c]) { watch.lastChange = { kind: 'array', component: c, expected: previous[c], actual: value[c] }; return false; }
        }
        for (const [material, side] of shadowSides) if (getAuthoredMaterialShadowSide(material) !== side) return false;
        for (const [object, geometry] of geometries) {
            const expected = checkGeometry ? geometry : geometryOverrides.get(object) ?? geometry;
            if (object.geometry !== expected) { watch.lastChange = { kind: 'geometry', owner: object.name }; return false; }
        }
        return true;
    };
    watch.setGeometryOverrides = (bindings) => { geometryOverrides = new Map(bindings.map(({ object, geometry }) => [object, geometry])); };
    watch.statistics = { fields: fields.length, shapes: shapes.length, arrays: arrays.length,
        components: arrays.reduce((sum, entry) => sum + entry[1].length, 0), objectFields, materialFields, materials: materials.size, textures: textures.size };
    watch.profile = () => {
        const start = performance.now(); monitor.unchanged(); const scalarMs = performance.now() - start;
        const allStart = performance.now(); watch(); return { scalarMs, totalMs: performance.now() - allStart };
    };
    return watch;
}

function createCapturedFieldWatch(fields) {
    const byObject = new Map();
    for (const [object, key, value] of fields) {
        let record = byObject.get(object);
        if (!record) { record = new Map(); byObject.set(object, record); }
        if (!record.has(key)) record.set(key, value);
    }
    const groups = new Map();
    for (const [object, record] of byObject) {
        const keys = [...record.keys()].sort();
        const signature = JSON.stringify(keys);
        let group = groups.get(signature);
        if (!group) {
            // Compile fixed property reads once per captured schema. JSON quoting keeps
            // semantic property names as data; renderer objects retain native descriptors.
            const read = new Function('objects', 'values', `for (let i = 0; i < objects.length; i++) {
                const o = objects[i], offset = i * ${keys.length};
                ${keys.map((key, i) => `if (!Object.is(o[${JSON.stringify(key)}], values[offset + ${i}])) return [i, ${i}];`).join('\n')}
            } return null;`);
            group = { keys, objects: [], values: [], read }; groups.set(signature, group);
        }
        group.objects.push(object);
        group.values.push(...keys.map((key) => record.get(key)));
    }
    const entries = [...groups.values()];
    let changed;
    return {
        unchanged() {
            for (const group of entries) {
                const difference = group.read(group.objects, group.values);
                if (difference) { changed = [group.objects[difference[0]], group.keys[difference[1]]]; return false; }
            }
            return true;
        },
        describe() {
            return { kind: 'field', owner: changed?.[0].name || changed?.[0].type, key: changed?.[1] };
        }
    };
}

/** @param {any} engine @param {any} city */
export function enhancedLightingKey(engine, city) {
    const s = city.sunRef, h = city.hemi, environment = engine.scene.environment, ibl = engine.lightingSettings?.ibl;
    return [s.direction.x, s.direction.y, s.direction.z, s.color.r, s.color.g, s.color.b, s.intensity,
        h.color.r, h.color.g, h.color.b, h.groundColor.r, h.groundColor.g, h.groundColor.b, h.intensity,
        ibl?.enabled !== false, ibl?.envMapIntensity ?? 0, environment?.userData?.iblHdrUrl ?? ibl?.hdrUrl ?? '',
        environment?.uuid ?? '', environment?.version ?? 0].join('|');
}
