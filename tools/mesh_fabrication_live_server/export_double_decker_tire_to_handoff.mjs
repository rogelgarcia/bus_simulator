#!/usr/bin/env node
// Extract a representative tire mesh from double-decker bus GLB and write
// mesh-fabrication handoff JSON (compiled topology).

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_GLB = 'assets/double_decker_bus/dd_bus.glb';
const DEFAULT_OUT = 'assets/public/mesh_fabrication/handoff/mesh.live.v1.json';
const DEFAULT_BACKUP = 'assets/public/mesh_fabrication/handoff/mesh.double_decker_bus_tire.backup.v1.json';

const TOPOLOGY_POLICY = Object.freeze({
    nonTopologyChangePreserveIds: true,
    topologyChangePolicy: 'preserve_unaffected_create_new_never_recycle'
});

const COMPILED_ID_POLICY = Object.freeze({
    topologyChangePolicy: 'preserve_unaffected_create_new_never_recycle',
    extrusionCapIdentity: 'always_new_derived_cap_id',
    ambiguousLoopFallback: 'ring_ordinal'
});

function printUsage() {
    console.log([
        'Usage:',
        '  node tools/mesh_fabrication_live_server/export_double_decker_tire_to_handoff.mjs [--glb <path>] [--out <path>] [--backup <path>]',
        '',
        'Defaults:',
        `  --glb    ${DEFAULT_GLB}`,
        `  --out    ${DEFAULT_OUT}`,
        `  --backup ${DEFAULT_BACKUP}`
    ].join('\n'));
}

function parseArgs(argv) {
    const out = {
        glb: DEFAULT_GLB,
        out: DEFAULT_OUT,
        backup: DEFAULT_BACKUP
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = String(argv[i] ?? '').trim();
        if (!arg) continue;
        if (arg === '-h' || arg === '--help') {
            out.help = true;
            continue;
        }
        if (arg === '--glb') {
            out.glb = String(argv[++i] ?? '').trim();
            continue;
        }
        if (arg === '--out') {
            out.out = String(argv[++i] ?? '').trim();
            continue;
        }
        if (arg === '--backup') {
            out.backup = String(argv[++i] ?? '').trim();
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.glb) throw new Error('--glb must be a non-empty path.');
    if (!out.out) throw new Error('--out must be a non-empty path.');
    if (!out.backup) throw new Error('--backup must be a non-empty path.');
    return out;
}

function pad6(value) {
    return String(value).padStart(6, '0');
}

function mat4Mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[(c * 4) + r] =
                (a[(0 * 4) + r] * b[(c * 4) + 0]) +
                (a[(1 * 4) + r] * b[(c * 4) + 1]) +
                (a[(2 * 4) + r] * b[(c * 4) + 2]) +
                (a[(3 * 4) + r] * b[(c * 4) + 3]);
        }
    }
    return o;
}

function mat4FromTRS(node) {
    if (Array.isArray(node?.matrix) && node.matrix.length === 16) {
        return node.matrix.map((v) => Number(v));
    }

    const t = Array.isArray(node?.translation) && node.translation.length === 3
        ? node.translation
        : [0, 0, 0];
    const q = Array.isArray(node?.rotation) && node.rotation.length === 4
        ? node.rotation
        : [0, 0, 0, 1];
    const s = Array.isArray(node?.scale) && node.scale.length === 3
        ? node.scale
        : [1, 1, 1];

    const x = Number(q[0]);
    const y = Number(q[1]);
    const z = Number(q[2]);
    const w = Number(q[3]);

    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;

    const sx = Number(s[0]);
    const sy = Number(s[1]);
    const sz = Number(s[2]);

    return [
        (1 - (yy + zz)) * sx,
        (xy + wz) * sx,
        (xz - wy) * sx,
        0,
        (xy - wz) * sy,
        (1 - (xx + zz)) * sy,
        (yz + wx) * sy,
        0,
        (xz + wy) * sz,
        (yz - wx) * sz,
        (1 - (xx + yy)) * sz,
        0,
        Number(t[0]),
        Number(t[1]),
        Number(t[2]),
        1
    ];
}

function transformPoint(m, p) {
    const x = Number(p[0]);
    const y = Number(p[1]);
    const z = Number(p[2]);
    return [
        (m[0] * x) + (m[4] * y) + (m[8] * z) + m[12],
        (m[1] * x) + (m[5] * y) + (m[9] * z) + m[13],
        (m[2] * x) + (m[6] * y) + (m[10] * z) + m[14]
    ];
}

function readGlb(glbBuffer) {
    if (glbBuffer.length < 20) throw new Error('GLB too small.');
    const dv = new DataView(glbBuffer.buffer, glbBuffer.byteOffset, glbBuffer.byteLength);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB magic.');
    if (dv.getUint32(4, true) !== 2) throw new Error('Unsupported GLB version.');

    let json = null;
    let bin = null;
    let offset = 12;
    while (offset + 8 <= glbBuffer.length) {
        const chunkLength = dv.getUint32(offset, true);
        const chunkType = dv.getUint32(offset + 4, true);
        const start = offset + 8;
        const end = start + chunkLength;
        if (end > glbBuffer.length) throw new Error('Invalid GLB chunk range.');
        if (chunkType === 0x4E4F534A) {
            json = JSON.parse(glbBuffer.subarray(start, end).toString('utf8'));
        } else if (chunkType === 0x004E4942) {
            bin = glbBuffer.subarray(start, end);
        }
        offset = end;
    }

    if (!json || !bin) throw new Error('Missing JSON/BIN chunks in GLB.');
    return { json, bin };
}

function accessorComponents(type) {
    switch (String(type ?? '')) {
        case 'SCALAR': return 1;
        case 'VEC2': return 2;
        case 'VEC3': return 3;
        case 'VEC4': return 4;
        case 'MAT2': return 4;
        case 'MAT3': return 9;
        case 'MAT4': return 16;
        default: return 1;
    }
}

function componentByteSize(componentType) {
    switch (componentType) {
        case 5120:
        case 5121:
            return 1;
        case 5122:
        case 5123:
            return 2;
        case 5125:
        case 5126:
            return 4;
        default:
            throw new Error(`Unsupported glTF componentType ${componentType}.`);
    }
}

function readComponent(view, offset, componentType) {
    switch (componentType) {
        case 5120: return view.getInt8(offset);
        case 5121: return view.getUint8(offset);
        case 5122: return view.getInt16(offset, true);
        case 5123: return view.getUint16(offset, true);
        case 5125: return view.getUint32(offset, true);
        case 5126: return view.getFloat32(offset, true);
        default:
            throw new Error(`Unsupported glTF componentType ${componentType}.`);
    }
}

function readAccessor(json, bin, accessorIndex) {
    const accessor = json.accessors?.[accessorIndex];
    const bufferView = json.bufferViews?.[accessor?.bufferView];
    if (!accessor || !bufferView) {
        throw new Error(`Invalid accessor ${accessorIndex}.`);
    }

    const count = Number(accessor.count ?? 0);
    const numComp = accessorComponents(accessor.type);
    const compType = Number(accessor.componentType);
    const compSize = componentByteSize(compType);
    const packedStride = numComp * compSize;
    const stride = Number(bufferView.byteStride ?? packedStride);
    const baseOffset = Number(bufferView.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);

    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
        const elementOffset = baseOffset + (i * stride);
        if (numComp === 1) {
            out[i] = readComponent(view, elementOffset, compType);
        } else {
            const row = new Array(numComp);
            for (let c = 0; c < numComp; c++) {
                row[c] = readComponent(view, elementOffset + (c * compSize), compType);
            }
            out[i] = row;
        }
    }
    return out;
}

function buildParentMap(nodes) {
    const parentByNode = new Array(nodes.length).fill(-1);
    for (let i = 0; i < nodes.length; i++) {
        const children = Array.isArray(nodes[i]?.children) ? nodes[i].children : [];
        for (const child of children) {
            if (!Number.isInteger(child) || child < 0 || child >= nodes.length) continue;
            parentByNode[child] = i;
        }
    }
    return parentByNode;
}

function buildWorldMatrixResolver(nodes, parentByNode) {
    const cache = new Map();
    const resolve = (index) => {
        const existing = cache.get(index);
        if (existing) return existing;
        const local = mat4FromTRS(nodes[index] ?? {});
        const parent = parentByNode[index];
        const world = parent >= 0 ? mat4Mul(resolve(parent), local) : local;
        cache.set(index, world);
        return world;
    };
    return resolve;
}

function buildNodeTriangles(json, bin, nodeIndex, worldMatrix) {
    const node = json.nodes?.[nodeIndex];
    const mesh = json.meshes?.[node?.mesh];
    if (!mesh || !Array.isArray(mesh.primitives)) return null;

    const vertices = [];
    const faces = [];

    for (const primitive of mesh.primitives) {
        const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
        if (mode !== 4) continue;
        const positionAccessor = primitive.attributes?.POSITION;
        if (!Number.isInteger(positionAccessor)) continue;

        const positions = readAccessor(json, bin, positionAccessor);
        const offset = vertices.length;
        for (const p of positions) {
            if (!Array.isArray(p) || p.length < 3) continue;
            vertices.push(transformPoint(worldMatrix, p));
        }

        const indices = Number.isInteger(primitive.indices)
            ? readAccessor(json, bin, primitive.indices)
            : Array.from({ length: positions.length }, (_, i) => i);

        for (let i = 0; i + 2 < indices.length; i += 3) {
            const a = Number(indices[i]);
            const b = Number(indices[i + 1]);
            const c = Number(indices[i + 2]);
            if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) continue;
            faces.push([offset + a, offset + b, offset + c]);
        }
    }

    if (vertices.length < 3 || faces.length < 1) return null;
    return { vertices, faces };
}

function buildBounds(vertices) {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const p of vertices) {
        if (!Array.isArray(p) || p.length < 3) continue;
        if (p[0] < min[0]) min[0] = p[0];
        if (p[1] < min[1]) min[1] = p[1];
        if (p[2] < min[2]) min[2] = p[2];
        if (p[0] > max[0]) max[0] = p[0];
        if (p[1] > max[1]) max[1] = p[1];
        if (p[2] > max[2]) max[2] = p[2];
    }
    return { min, max };
}

function normalizeBottomCentered(vertices) {
    const bounds = buildBounds(vertices);
    const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
    const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
    const minY = bounds.min[1];
    return vertices.map((p) => [p[0] - cx, p[1] - minY, p[2] - cz]);
}

function compactIndexedMesh(vertices, faces) {
    const used = new Set();
    for (const face of faces) {
        for (const idx of face) used.add(idx);
    }
    const oldToNew = new Map();
    const sorted = [...used].sort((a, b) => a - b);
    const compactVertices = [];
    for (let i = 0; i < sorted.length; i++) {
        const oldIndex = sorted[i];
        oldToNew.set(oldIndex, i);
        compactVertices.push(vertices[oldIndex]);
    }
    const compactFaces = faces.map((face) => face.map((oldIndex) => oldToNew.get(oldIndex)));
    return { vertices: compactVertices, faces: compactFaces };
}

function buildEdgesAndFaceEdgeIndices(faces) {
    const edges = [];
    const edgeByPair = new Map();
    const faceEdgeIndices = [];

    const getEdgeIndex = (a, b) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const existing = edgeByPair.get(key);
        if (existing !== undefined) return existing;
        const index = edges.length;
        edges.push(a < b ? [a, b] : [b, a]);
        edgeByPair.set(key, index);
        return index;
    };

    for (const face of faces) {
        const ring = [];
        for (let i = 0; i < face.length; i++) {
            const a = face[i];
            const b = face[(i + 1) % face.length];
            ring.push(getEdgeIndex(a, b));
        }
        faceEdgeIndices.push(ring);
    }

    return { edges, faceEdgeIndices };
}

function toCompiledObject({ objectId, material, sourceName, vertices, faces }) {
    const normalizedVertices = normalizeBottomCentered(vertices);
    const { edges, faceEdgeIndices } = buildEdgesAndFaceEdgeIndices(faces);

    const vertexIds = normalizedVertices.map((_, i) => `${objectId}.vertex.v${pad6(i)}`);
    const edgeIds = edges.map((_, i) => `${objectId}.edge.e${pad6(i)}`);
    const faceIds = faces.map((_, i) => `${objectId}.face.f${pad6(i)}`);

    return {
        objectId,
        material,
        vertexIds,
        vertices: normalizedVertices,
        edgeIds,
        edges,
        faceIds,
        faces,
        faceEdgeIndices,
        faceLabels: faceIds.map((_, i) => `${sourceName}.face.${pad6(i)}`),
        faceCanonicalLabels: faceIds.map((_, i) => `${sourceName}.face.${pad6(i)}`),
        transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        }
    };
}

function pickDoubleDeckerTire(json, bin) {
    const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
    const meshes = Array.isArray(json?.meshes) ? json.meshes : [];
    const parentByNode = buildParentMap(nodes);
    const world = buildWorldMatrixResolver(nodes, parentByNode);

    const tireToken = /material[^a-z0-9]*79[^a-z0-9]*slot[^a-z0-9]*3/i;
    const candidates = [];

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!Number.isInteger(node?.mesh)) continue;
        const mesh = meshes[node.mesh];
        const nodeName = String(node.name ?? '');
        const meshName = String(mesh?.name ?? '');
        if (!tireToken.test(nodeName) && !tireToken.test(meshName)) continue;

        const extracted = buildNodeTriangles(json, bin, i, world(i));
        if (!extracted) continue;
        const compact = compactIndexedMesh(extracted.vertices, extracted.faces);
        const bounds = buildBounds(compact.vertices);
        const center = [
            (bounds.min[0] + bounds.max[0]) * 0.5,
            (bounds.min[1] + bounds.max[1]) * 0.5,
            (bounds.min[2] + bounds.max[2]) * 0.5
        ];

        candidates.push({
            nodeIndex: i,
            sourceName: nodeName || meshName || `node_${i}`,
            center,
            vertices: compact.vertices,
            faces: compact.faces
        });
    }

    if (!candidates.length) {
        throw new Error('No double-decker tire candidates matched expected material token.');
    }

    // Deterministic representative choice: front-right tire
    // (highest Z, then highest X).
    candidates.sort((a, b) => {
        if (b.center[2] !== a.center[2]) return b.center[2] - a.center[2];
        if (b.center[0] !== a.center[0]) return b.center[0] - a.center[0];
        return a.nodeIndex - b.nodeIndex;
    });

    return candidates[0];
}

function buildDocument(tire) {
    return {
        format: 'mesh-fabrication-handoff.v2',
        meshId: 'demo.mesh_fabrication.double_decker_bus_tire_topology',
        revision: `rev-${Date.now()}`,
        topology: {
            version: 'topology.rev-0010',
            idLifecycle: { ...TOPOLOGY_POLICY }
        },
        materials: {
            mat_double_decker_tire: {
                color: '#2a2d33',
                roughness: 0.9,
                metalness: 0
            }
        },
        compiled: {
            version: 'mesh-fabrication-compiled.v1',
            idPolicy: { ...COMPILED_ID_POLICY },
            source: {
                doubleDeckerBus: {
                    asset: DEFAULT_GLB,
                    selectedNode: tire.sourceName,
                    selectedNodeIndex: tire.nodeIndex
                }
            },
            objects: [
                toCompiledObject({
                    objectId: 'part.double_decker_bus.tire.sample',
                    material: 'mat_double_decker_tire',
                    sourceName: `double_decker.${tire.sourceName}`,
                    vertices: tire.vertices,
                    faces: tire.faces
                })
            ]
        }
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const glbPath = path.resolve(args.glb);
    const outPath = path.resolve(args.out);
    const backupPath = path.resolve(args.backup);
    const glbBuffer = await readFile(glbPath);
    const { json, bin } = readGlb(glbBuffer);
    const tire = pickDoubleDeckerTire(json, bin);
    const doc = buildDocument(tire);
    const payload = `${JSON.stringify(doc, null, 2)}\n`;

    await writeFile(backupPath, payload, 'utf8');
    await writeFile(outPath, payload, 'utf8');

    console.log(`[MeshDoubleDeckerTireExport] Selected ${tire.sourceName} [node ${tire.nodeIndex}]`);
    console.log(`[MeshDoubleDeckerTireExport] Vertices: ${tire.vertices.length}, Faces: ${tire.faces.length}`);
    console.log(`[MeshDoubleDeckerTireExport] Wrote backup: ${backupPath}`);
    console.log(`[MeshDoubleDeckerTireExport] Wrote live: ${outPath}`);
}

main().catch((err) => {
    console.error(`[MeshDoubleDeckerTireExport] ${err?.message ?? String(err)}`);
    process.exitCode = 1;
});
