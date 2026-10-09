// Inject failures into the real canopy orchestration without allocating GPU targets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const moduleSource = (await readFile(new URL('../../../src/graphics/gui/grass_debugger_v2/GrassDebugV2FieldCanopy.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.create = createGrassDebugV2FieldCanopy;';

function fixture(failure) {
    const geometries = [], bakes = [], materials = [], periodic = [], borders = [], reliefs = [], walls = [], bases = [], injected = new Error('injected-' + failure);
    class Attribute {
        constructor(array, itemSize, normalized = false) { this.array = array; this.itemSize = itemSize; this.normalized = normalized; this.count = array.length / itemSize; }
        getX(i) { return this.array[i * this.itemSize]; }
        getY(i) { return this.array[i * this.itemSize + 1]; }
        getZ(i) { return this.array[i * this.itemSize + 2]; }
        copyAt(to, source, from) { for (let i = 0; i < this.itemSize; i++) this.array[to * this.itemSize + i] = source.array[from * source.itemSize + i]; }
        clone() { return new Attribute(this.array.slice(), this.itemSize, this.normalized); }
    }
    class FloatAttribute extends Attribute { constructor(array, size) { super(new Float32Array(array), size); } }
    class Geometry {
        constructor() { this.attributes = {}; this.disposals = 0; geometries.push(this); }
        setAttribute(name, value) { this.attributes[name] = value; }
        setIndex(array) { this.index = new Attribute(new Uint32Array(array), 1); }
        computeBoundingBox() { this.boundingBox = { max: { y: .2 } }; }
        computeBoundingSphere() {}
        computeVertexNormals() {}
        clone() { const copy = new Geometry(); copy.attributes = Object.fromEntries(Object.entries(this.attributes).map(([key, value]) => [key, value.clone()])); copy.index = this.index.clone(); copy.computeBoundingBox(); return copy; }
        dispose() { this.disposals++; }
    }
    class Mesh {
        constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; }
        clone() { const copy = new Mesh(this.geometry, this.material); copy.userData = { ...this.userData }; return copy; }
    }
    class Group { constructor() { this.children = []; } add(...objects) { this.children.push(...objects); } }
    const disposable = list => { const value = { disposals: 0, dispose() { this.disposals++; } }; list.push(value); return value; };
    let bakeCalls = 0;
    const context = { performance, console,
        THREE: { BufferGeometry: Geometry, BufferAttribute: Attribute, Float32BufferAttribute: FloatAttribute, Mesh, Group, Vector4: class {},
            MathUtils: { smoothstep: (x, min, max) => Math.max(0, Math.min(1, (x - min) / (max - min))), lerp: (a, b, t) => a + (b - a) * t } },
        grassCanopyLayoutIdentity: async (mesh, config) => ({ ...config, hash: 'source', vertices: 3, leaves: 1 }),
        loadGrassCanopyLayoutPair: async () => {
            if (failure === 'layout') throw injected;
            return { variants: [{ placement: {}, optimization: {}, renderedOptimization: {} }, {}] };
        },
        validateGrassCanopyPairBoundaries: () => ({}),
        createGrassDebugV2PeriodicSource: () => Object.assign(disposable(periodic), { group: {}, getSnapshot: () => ({}) }),
        createGrassDebugV2FieldCanopyBake: async () => {
            if (++bakeCalls === 2 && failure === 'second-bake') throw injected;
            const profile = { textures: {}, getSnapshot: () => ({ estimatedTextureBytes: 1, residentTextureBytes: 1 }) };
            return Object.assign(disposable(bakes), { ...profile, profiles: { default: profile } });
        },
        createGrassDebugV2CanopyMaterials: () => ({ all: disposable(materials), grass: disposable(materials) }),
        createGrassDebugV2CardBase: async () => {
            if (failure === 'card-base') throw injected;
            return disposable(bases);
        },
        createGrassDebugV2CanopyWall: async () => {
            if(failure === 'wall')throw injected;
            return Object.assign(disposable(walls),{group:new Group(),getSnapshot:()=>({triangles:0})});
        },
        GRASS_CANOPY_RELIEF: {},
        createGrassDebugV2CanopyRelief: () => {
            if (failure === 'relief') throw injected;
            return Object.assign(disposable(reliefs), { group: new Group() });
        },
        createGrassDebugV2CanopyBorderCards: async () => {
            if (failure === 'border') throw injected;
            return Object.assign(disposable(borders), { group: new Group(), getSnapshot: () => ({ triangles: 0, liveLeaves: 0, cardLeaves: 0 }) });
        }
    };
    runInNewContext(moduleSource, context);
    const sourceGeometry = new Geometry();
    sourceGeometry.setAttribute('position', new FloatAttribute([0, 0, 0, .02, 0, 0, 0, .2, .02], 3));
    sourceGeometry.setAttribute('uv', new FloatAttribute([0, 0, 1, 0, 0, 1], 2));
    sourceGeometry.setIndex([0, 1, 2]); sourceGeometry.computeBoundingBox();
    const source = new Mesh(sourceGeometry, {}); source.userData.grassLeafRanges = [{ start: 0, count: 3 }];
    const direction = { x: .5, y: 1, z: .2, clone() { return this; }, normalize() { return this; }, toArray() { return [.5, 1, .2]; } };
    return { run: () => context.create({ renderer: {}, source, lod2: source, soil: {}, litter: {}, width: 4, depth: 4, shadowDirection: direction, lighting: {}, cardBaseDensity: .45 }),
        sourceGeometry, geometries, bakes, materials, periodic, borders, reliefs, walls, bases, injected };
}

for (const failure of ['layout', 'second-bake', 'card-base', 'wall', 'relief', 'border']) test('canopy releases owned resources after ' + failure + ' failure', async () => {
    const f = fixture(failure);
    await assert.rejects(f.run(), error => error === f.injected);
    assert.equal(f.sourceGeometry.disposals, 0);
    assert(f.geometries.filter(g => g !== f.sourceGeometry).every(g => g.disposals === 1));
    assert(f.bakes.every(b => b.disposals === 1));
    assert(f.materials.every(m => m.disposals === 1));
    assert(f.periodic.every(p => p.disposals === 1));
    assert(f.reliefs.every(r => r.disposals === 1));
    assert(f.walls.every(r => r.disposals === 1));
    assert(f.bases.every(r => r.disposals === 1));
    assert.equal(f.bakes.length, failure === 'layout' ? 0 : failure === 'second-bake' ? 1 : 2);
});

test('successful canopy keeps persistent resources until explicit disposal', async () => {
    const f = fixture(null), result = await f.run();
    assert.equal(f.geometries.filter(g => g !== f.sourceGeometry && g.disposals === 1).length, 2);
    assert(f.bakes.every(b => b.disposals === 0)); assert(f.materials.every(m => m.disposals === 0));
    assert(f.periodic.every(p => p.disposals === 1));
    assert(f.bases.every(r => r.disposals === 0));
    result.dispose();
    assert(f.geometries.filter(g => g !== f.sourceGeometry).every(g => g.disposals === 1));
    assert(f.bakes.every(b => b.disposals === 1)); assert(f.materials.every(m => m.disposals === 1));
    assert(f.borders.every(b => b.disposals === 1)); assert.equal(f.sourceGeometry.disposals, 0);
    assert(f.reliefs.every(r => r.disposals === 1));
    assert(f.walls.every(r => r.disposals === 1));
    assert(f.bases.every(r => r.disposals === 1));
});
