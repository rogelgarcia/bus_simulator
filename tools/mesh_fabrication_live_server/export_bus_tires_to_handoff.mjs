#!/usr/bin/env node
// Export representative tire meshes from city_bus OBJ and coach_bus GLB
// into mesh-fabrication handoff (compiled topology) for topology inspection.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CITY_OBJ = 'assets/city_bus/obj/Obj/Bus.obj';
const DEFAULT_COACH_GLB = 'assets/coach_bus/coach_bus.glb';
const DEFAULT_OUT = 'assets/public/mesh_fabrication/handoff/mesh.live.v1.json';

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
        '  node tools/mesh_fabrication_live_server/export_bus_tires_to_handoff.mjs [--out <path>] [--city-obj <path>] [--coach-glb <path>]',
        '',
        'Defaults:',
        `  --out       ${DEFAULT_OUT}`,
        `  --city-obj  ${DEFAULT_CITY_OBJ}`,
        `  --coach-glb ${DEFAULT_COACH_GLB}`
    ].join('\n'));
}

function parseArgs(argv) {
    const out = {
        outFile: DEFAULT_OUT,
        cityObj: DEFAULT_CITY_OBJ,
        coachGlb: DEFAULT_COACH_GLB
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = String(argv[i] ?? '').trim();
        if (!arg) continue;
        if (arg === '-h' || arg === '--help') {
            out.help = true;
            continue;
        }
        if (arg === '--out') {
            out.outFile = String(argv[++i] ?? '').trim();
            continue;
        }
        if (arg === '--city-obj') {
            out.cityObj = String(argv[++i] ?? '').trim();
            continue;
        }
        if (arg === '--coach-glb') {
            out.coachGlb = String(argv[++i] ?? '').trim();
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.outFile) throw new Error('--out must be a non-empty path.');
    if (!out.cityObj) throw new Error('--city-obj must be a non-empty path.');
    if (!out.coachGlb) throw new Error('--coach-glb must be a non-empty path.');
    return out;
}

function pad6(value) {
    return String(value).padStart(6, '0');
}

function isFiniteVec3(v) {
    return Array.isArray(v)
        && v.length === 3
        && Number.isFinite(v[0])
        && Number.isFinite(v[1])
        && Number.isFinite(v[2]);
}

function ensureFaceVertices(face, label) {
    if (!Array.isArray(face) || face.length < 3) {
        throw new Error(`${label} must contain at least 3 vertex indices.`);
    }
    for (const idx of face) {
        if (!Number.isInteger(idx) || idx < 0) {
            throw new Error(`${label} includes invalid vertex index "${idx}".`);
        }
    }
}

function buildBounds(vertices) {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const v of vertices) {
        if (!isFiniteVec3(v)) continue;
        if (v[0] < min[0]) min[0] = v[0];
        if (v[1] < min[1]) min[1] = v[1];
        if (v[2] < min[2]) min[2] = v[2];
        if (v[0] > max[0]) max[0] = v[0];
        if (v[1] > max[1]) max[1] = v[1];
        if (v[2] > max[2]) max[2] = v[2];
    }
    return { min, max };
}

function normalizeBottomCentered(vertices) {
    const bounds = buildBounds(vertices);
    const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
    const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
    const minY = bounds.min[1];
    return vertices.map((v) => [v[0] - cx, v[1] - minY, v[2] - cz]);
}

function compactIndexedMesh(rawVertices, rawFaces) {
    if (!Array.isArray(rawVertices) || rawVertices.length < 3) {
        throw new Error('compactIndexedMesh expects at least 3 vertices.');
    }
    if (!Array.isArray(rawFaces) || rawFaces.length < 1) {
        throw new Error('compactIndexedMesh expects at least 1 face.');
    }

    const used = new Set();
    for (let i = 0; i < rawFaces.length; i++) {
        const face = rawFaces[i];
        ensureFaceVertices(face, `faces[${i}]`);
        for (const idx of face) {
            if (idx >= rawVertices.length) {
                throw new Error(`faces[${i}] references out-of-range vertex ${idx}.`);
            }
            used.add(idx);
        }
    }

    const oldToNew = new Map();
    const sortedUsed = [...used].sort((a, b) => a - b);
    const vertices = [];
    for (let i = 0; i < sortedUsed.length; i++) {
        const oldIndex = sortedUsed[i];
        oldToNew.set(oldIndex, i);
        vertices.push(rawVertices[oldIndex]);
    }

    const faces = rawFaces.map((face) => face.map((oldIndex) => oldToNew.get(oldIndex)));
    return { vertices, faces };
}

function buildEdgesAndFaceEdgeIndices(faces) {
    const edgeMap = new Map();
    const edges = [];
    const faceEdgeIndices = [];

    const getEdgeIndex = (a, b) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const existing = edgeMap.get(key);
        if (existing !== undefined) return existing;
        const idx = edges.length;
        edges.push(a < b ? [a, b] : [b, a]);
        edgeMap.set(key, idx);
        return idx;
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

function toCompiledObject({
    objectId,
    materialId,
    sourceName,
    vertices,
    faces,
    position = [0, 0, 0]
}) {
    const normalizedVertices = normalizeBottomCentered(vertices);
    const { edges, faceEdgeIndices } = buildEdgesAndFaceEdgeIndices(faces);

    const vertexIds = normalizedVertices.map((_, i) => `${objectId}.vertex.v${pad6(i)}`);
    const edgeIds = edges.map((_, i) => `${objectId}.edge.e${pad6(i)}`);
    const faceIds = faces.map((_, i) => `${objectId}.face.f${pad6(i)}`);

    return {
        objectId,
        material: materialId,
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
            position: [...position],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        }
    };
}

function parseObjVertexIndex(token, vertexCount) {
    const head = String(token ?? '').split('/')[0];
    if (!head) return null;
    const raw = Number(head);
    if (!Number.isInteger(raw) || raw === 0) return null;
    const idx = raw > 0 ? (raw - 1) : (vertexCount + raw);
    return idx >= 0 && idx < vertexCount ? idx : null;
}

function parseCityObjTireSelection(src) {
    const lines = String(src ?? '').split(/\r?\n/);
    const vertices = [];
    const facesByObject = new Map();
    let currentObject = '';

    const pushFace = (name, face) => {
        if (!name || !/tire|tyre/i.test(name)) return;
        if (!facesByObject.has(name)) facesByObject.set(name, []);
        facesByObject.get(name).push(face);
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        if (line.startsWith('o ') || line.startsWith('g ')) {
            currentObject = line.slice(2).trim();
            continue;
        }

        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            if (parts.length < 4) continue;
            const x = Number(parts[1]);
            const y = Number(parts[2]);
            const z = Number(parts[3]);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            vertices.push([x, y, z]);
            continue;
        }

        if (line.startsWith('f ')) {
            const parts = line.split(/\s+/).slice(1);
            if (parts.length < 3) continue;
            const face = [];
            for (const part of parts) {
                const idx = parseObjVertexIndex(part, vertices.length);
                if (idx === null) continue;
                face.push(idx);
            }
            if (face.length >= 3) pushFace(currentObject, face);
        }
    }

    const tireNames = [...facesByObject.keys()].sort((a, b) => a.localeCompare(b));
    if (!tireNames.length) {
        throw new Error('No tire objects found in city bus OBJ.');
    }

    const preferred = tireNames.find((name) => /^frtire/i.test(name))
        || tireNames.find((name) => /^fltire/i.test(name))
        || tireNames[0];

    const rawFaces = facesByObject.get(preferred) ?? [];
    const compact = compactIndexedMesh(vertices, rawFaces);
    return {
        sourceName: preferred,
        vertices: compact.vertices,
        faces: compact.faces
    };
}

function readGlbChunks(buffer) {
    if (buffer.length < 20) throw new Error('GLB too small.');
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const magic = dv.getUint32(0, true);
    if (magic !== 0x46546c67) throw new Error('Invalid GLB magic.');
    const version = dv.getUint32(4, true);
    if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);

    let offset = 12;
    let json = null;
    let bin = null;
    while (offset + 8 <= buffer.length) {
        const chunkLength = dv.getUint32(offset, true);
        const chunkType = dv.getUint32(offset + 4, true);
        const start = offset + 8;
        const end = start + chunkLength;
        if (end > buffer.length) throw new Error('Invalid GLB chunk length.');
        if (chunkType === 0x4E4F534A) {
            json = JSON.parse(buffer.subarray(start, end).toString('utf8'));
        } else if (chunkType === 0x004E4942) {
            bin = buffer.subarray(start, end);
        }
        offset = end;
    }
    if (!json || !bin) throw new Error('GLB missing JSON or BIN chunk.');
    return { json, bin };
}

function mat4Identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[(c * 4) + r] =
                (a[(0 * 4) + r] * b[(c * 4) + 0]) +
                (a[(1 * 4) + r] * b[(c * 4) + 1]) +
                (a[(2 * 4) + r] * b[(c * 4) + 2]) +
                (a[(3 * 4) + r] * b[(c * 4) + 3]);
        }
    }
    return out;
}

function mat4FromTRS(translation, rotationQuat, scale) {
    const t = Array.isArray(translation) && translation.length === 3 ? translation : [0, 0, 0];
    const q = Array.isArray(rotationQuat) && rotationQuat.length === 4 ? rotationQuat : [0, 0, 0, 1];
    const s = Array.isArray(scale) && scale.length === 3 ? scale : [1, 1, 1];

    const x = Number(q[0]); const y = Number(q[1]); const z = Number(q[2]); const w = Number(q[3]);
    const x2 = x + x; const y2 = y + y; const z2 = z + z;
    const xx = x * x2; const xy = x * y2; const xz = x * z2;
    const yy = y * y2; const yz = y * z2; const zz = z * z2;
    const wx = w * x2; const wy = w * y2; const wz = w * z2;

    const sx = Number(s[0]); const sy = Number(s[1]); const sz = Number(s[2]);

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

function transformPoint(mat, p) {
    const x = Number(p[0]); const y = Number(p[1]); const z = Number(p[2]);
    const ox = (mat[0] * x) + (mat[4] * y) + (mat[8] * z) + mat[12];
    const oy = (mat[1] * x) + (mat[5] * y) + (mat[9] * z) + mat[13];
    const oz = (mat[2] * x) + (mat[6] * y) + (mat[10] * z) + mat[14];
    return [ox, oy, oz];
}

function buildNodeParentMap(nodes) {
    const parentByNode = new Array(nodes.length).fill(-1);
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const children = Array.isArray(node?.children) ? node.children : [];
        for (const childIndex of children) {
            if (!Number.isInteger(childIndex) || childIndex < 0 || childIndex >= nodes.length) continue;
            parentByNode[childIndex] = i;
        }
    }
    return parentByNode;
}

function getNodeLocalMatrix(node) {
    if (Array.isArray(node?.matrix) && node.matrix.length === 16) {
        return node.matrix.map((v) => Number(v));
    }
    return mat4FromTRS(node?.translation, node?.rotation, node?.scale);
}

function getNodeWorldMatrix(nodeIndex, nodes, parentByNode, cache) {
    const existing = cache.get(nodeIndex);
    if (existing) return existing;
    const node = nodes[nodeIndex] ?? {};
    const local = getNodeLocalMatrix(node);
    const parentIndex = parentByNode[nodeIndex];
    const world = parentIndex >= 0
        ? mat4Multiply(getNodeWorldMatrix(parentIndex, nodes, parentByNode, cache), local)
        : local;
    cache.set(nodeIndex, world);
    return world;
}

function accessorElementCount(type) {
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
        case 5120: // BYTE
        case 5121: // UNSIGNED_BYTE
            return 1;
        case 5122: // SHORT
        case 5123: // UNSIGNED_SHORT
            return 2;
        case 5125: // UNSIGNED_INT
        case 5126: // FLOAT
            return 4;
        default:
            throw new Error(`Unsupported glTF componentType: ${componentType}`);
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
            throw new Error(`Unsupported glTF componentType: ${componentType}`);
    }
}

function readAccessor(json, binChunk, accessorIndex) {
    const accessors = Array.isArray(json?.accessors) ? json.accessors : [];
    const bufferViews = Array.isArray(json?.bufferViews) ? json.bufferViews : [];
    const accessor = accessors[accessorIndex];
    if (!accessor || typeof accessor !== 'object') {
        throw new Error(`Invalid accessor index ${accessorIndex}.`);
    }
    const bufferView = bufferViews[accessor.bufferView];
    if (!bufferView || typeof bufferView !== 'object') {
        throw new Error(`Accessor ${accessorIndex} references invalid bufferView.`);
    }

    const count = Number(accessor.count ?? 0);
    const numComp = accessorElementCount(accessor.type);
    const compType = Number(accessor.componentType);
    const compSize = componentByteSize(compType);

    const bufferViewOffset = Number(bufferView.byteOffset ?? 0);
    const accessorOffset = Number(accessor.byteOffset ?? 0);
    const baseOffset = bufferViewOffset + accessorOffset;
    const packedStride = numComp * compSize;
    const stride = Number(bufferView.byteStride ?? packedStride);

    const view = new DataView(binChunk.buffer, binChunk.byteOffset, binChunk.byteLength);
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

function buildNodeMeshTriangles(json, binChunk, nodeIndex, worldMatrix) {
    const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
    const meshes = Array.isArray(json?.meshes) ? json.meshes : [];
    const node = nodes[nodeIndex] ?? {};
    const mesh = meshes[node.mesh];
    if (!mesh || !Array.isArray(mesh.primitives) || mesh.primitives.length < 1) {
        return null;
    }

    const vertices = [];
    const faces = [];

    for (const primitive of mesh.primitives) {
        const mode = primitive.mode === undefined ? 4 : Number(primitive.mode);
        if (mode !== 4) continue; // TRIANGLES only
        const positionAccessor = primitive.attributes?.POSITION;
        if (!Number.isInteger(positionAccessor)) continue;

        const positions = readAccessor(json, binChunk, positionAccessor);
        const localOffset = vertices.length;
        for (const p of positions) {
            if (!Array.isArray(p) || p.length < 3) continue;
            vertices.push(transformPoint(worldMatrix, p));
        }

        let indices = null;
        if (Number.isInteger(primitive.indices)) {
            indices = readAccessor(json, binChunk, primitive.indices);
        } else {
            indices = Array.from({ length: positions.length }, (_, i) => i);
        }

        for (let i = 0; i + 2 < indices.length; i += 3) {
            const a = Number(indices[i]);
            const b = Number(indices[i + 1]);
            const c = Number(indices[i + 2]);
            if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) continue;
            faces.push([localOffset + a, localOffset + b, localOffset + c]);
        }
    }

    if (vertices.length < 3 || faces.length < 1) return null;
    return { vertices, faces };
}

function pickCoachTireNode(json, binChunk) {
    const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
    const parentByNode = buildNodeParentMap(nodes);
    const worldCache = new Map();

    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i] ?? {};
        const name = String(node.name ?? '');
        if (!/tier|tire|tyre|wheel/i.test(name)) continue;
        if (/metalic/i.test(name)) continue;
        if (!Number.isInteger(node.mesh)) continue;

        const world = getNodeWorldMatrix(i, nodes, parentByNode, worldCache);
        const extracted = buildNodeMeshTriangles(json, binChunk, i, world);
        if (!extracted) continue;
        const bounds = buildBounds(extracted.vertices);
        const center = [
            (bounds.min[0] + bounds.max[0]) * 0.5,
            (bounds.min[1] + bounds.max[1]) * 0.5,
            (bounds.min[2] + bounds.max[2]) * 0.5
        ];
        candidates.push({
            nodeIndex: i,
            name,
            center,
            vertices: extracted.vertices,
            faces: extracted.faces
        });
    }

    if (!candidates.length) {
        throw new Error('No non-metallic tire nodes found in coach bus GLB.');
    }

    candidates.sort((a, b) => {
        if (b.center[0] !== a.center[0]) return b.center[0] - a.center[0];
        if (b.center[2] !== a.center[2]) return b.center[2] - a.center[2];
        return a.nodeIndex - b.nodeIndex;
    });

    return candidates[0];
}

function buildHandoffDocument(city, coach) {
    return {
        format: 'mesh-fabrication-handoff.v2',
        meshId: 'demo.mesh_fabrication.bus_tire_topology',
        revision: `rev-${Date.now()}`,
        topology: {
            version: 'topology.rev-0010',
            idLifecycle: { ...TOPOLOGY_POLICY }
        },
        materials: {
            mat_city_tire: {
                color: '#2a2d33',
                roughness: 0.9,
                metalness: 0
            },
            mat_coach_tire: {
                color: '#334155',
                roughness: 0.82,
                metalness: 0.08
            }
        },
        compiled: {
            version: 'mesh-fabrication-compiled.v1',
            idPolicy: { ...COMPILED_ID_POLICY },
            source: {
                cityBus: {
                    asset: DEFAULT_CITY_OBJ,
                    selectedObject: city.sourceName
                },
                coachBus: {
                    asset: DEFAULT_COACH_GLB,
                    selectedNode: coach.sourceName
                }
            },
            objects: [
                toCompiledObject({
                    objectId: 'part.city_bus.tire.sample',
                    materialId: 'mat_city_tire',
                    sourceName: `city.${city.sourceName}`,
                    vertices: city.vertices,
                    faces: city.faces,
                    position: [-1.8, 0, 0]
                }),
                toCompiledObject({
                    objectId: 'part.coach_bus.tire.sample',
                    materialId: 'mat_coach_tire',
                    sourceName: `coach.${coach.sourceName}`,
                    vertices: coach.vertices,
                    faces: coach.faces,
                    position: [1.8, 0, 0]
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

    const cityObjPath = path.resolve(args.cityObj);
    const coachGlbPath = path.resolve(args.coachGlb);
    const outPath = path.resolve(args.outFile);

    const [cityObjRaw, coachGlbRaw] = await Promise.all([
        readFile(cityObjPath, 'utf8'),
        readFile(coachGlbPath)
    ]);

    const city = parseCityObjTireSelection(cityObjRaw);
    const { json, bin } = readGlbChunks(coachGlbRaw);
    const coachNode = pickCoachTireNode(json, bin);
    const coach = compactIndexedMesh(coachNode.vertices, coachNode.faces);

    const document = buildHandoffDocument(city, {
        sourceName: coachNode.name,
        vertices: coach.vertices,
        faces: coach.faces
    });

    const output = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(outPath, output, 'utf8');

    console.log(`[MeshTireExport] Wrote ${outPath}`);
    console.log(`[MeshTireExport] City tire source: ${city.sourceName} (${city.vertices.length} vertices, ${city.faces.length} faces)`);
    console.log(`[MeshTireExport] Coach tire source: ${coachNode.name} [node ${coachNode.nodeIndex}] (${coach.vertices.length} vertices, ${coach.faces.length} faces)`);
}

main().catch((err) => {
    console.error(`[MeshTireExport] ${err?.message ?? String(err)}`);
    process.exitCode = 1;
});
