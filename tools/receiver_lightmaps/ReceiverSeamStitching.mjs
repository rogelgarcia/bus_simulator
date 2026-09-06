// Constrains lightmap filtering to agree across UV seams on the same physical plane.
import { open } from 'node:fs/promises';
import path from 'node:path';
import { receiverVisiblePieces, receiverClippedEdgeSeams } from './ReceiverVisibleSeams.mjs';

export const RECEIVER_SEAM_POLICY = 'visible-coplanar-bilinear-seam-constraints-v2';
const sub = (a, b) => a.map((v, c) => v - b[c]);
const dot = (a, b) => a.reduce((sum, v, c) => sum + v * b[c], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

function accessor(parsed, attribute) {
    const bytes = parsed.getBuffer(attribute.bufferId), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const [method, width] = { f32: ['getFloat32', 4], u32: ['getUint32', 4], u16: ['getUint16', 2], u8: ['getUint8', 1] }[attribute.componentType];
    return (i, c = 0) => view[method](attribute.byteOffset + i * attribute.byteStride + c * width, true);
}

/** Emits only proven shared edges; quantization shortlists, actual coordinates and normals decide. */
export function receiverChartSeams(parsed, charts, profile) {
    const geometries = new Map(parsed.manifest.geometries.map(g => [g.id, {
        position: accessor(parsed, g.attributes.position), index: g.index ? accessor(parsed, g.index) : i => i, groups: g.groups ?? []
    }]));
    const instances = new Map(parsed.manifest.meshInstances.map(i => [i.id, i]));
    const groups = new Map();
    for (const chart of charts) {
        if (!groups.has(chart.instanceId)) groups.set(chart.instanceId, []);
        groups.get(chart.instanceId).push(chart);
    }
    const seams = [];
    // Keep only one source object's edge inventory resident at a time. Source
    // triangles retain identity across batching and private runtime clipping.
    for (const [id, members] of groups) {
        const instance = instances.get(id), g = geometries.get(instance.geometryId), m = instance.matrixThreeWorld;
        const world = index => [0, 1, 2].map(c => m[12+c] + [0, 1, 2].reduce((s, k) => s + m[k*4+c]*g.position(g.index(index), k), 0));
        const edges = new Map(), visibleEdges = [], pieces = receiverVisiblePieces(g, members);
        for (const chart of members) for (const triangle of chart.triangles) {
            const originalPoints = [0, 1, 2].map(c => world(triangle.offset+c));
            const n = cross(sub(originalPoints[1], originalPoints[0]), sub(originalPoints[2], originalPoints[0])), length = Math.hypot(...n), normal = n.map(v => v/length);
            const originalPixels = triangle.uv.map(uv => uv.map((v, c) => (v-chart.min[c])*chart.texelsPerMeter[c]
                + profile.padding + (chart.pixelOffset?.[c] ?? .5) + (c ? chart.y : chart.x)));
            for (const piece of pieces.get(triangle.offset) ?? [[[1,0,0],[0,1,0],[0,0,1]]]) {
                const interpolate = values => piece.map(w => values[0].map((_, c) => w.reduce((sum, v, i) => sum+v*values[i][c], 0)));
                const p = interpolate(originalPoints), pixels = interpolate(originalPixels);
                const keys = p.map(v => v.map(c => Math.round(c*1e6)).join(','));
                for (let c = 0; c < 3; c++) {
                    const next = (c+1)%3, reverse = keys[c] > keys[next], order = reverse ? [next, c] : [c, next];
                    const key = order.map(i => keys[i]).join('/');
                    const edge = { chart, normal, points: order.map(i => p[i]), pixels: order.map(i => pixels[i]), third: p[(c+2)%3], clipped: pieces.has(triangle.offset) };
                    if (pieces.size) visibleEdges.push(edge);
                    const previous = edges.get(key) ?? [];
                    for (const other of previous) {
                        if (other.chart === chart || dot(normal, other.normal) < 1-1e-10
                            || edge.points.some((point, i) => Math.hypot(...sub(point, other.points[i])) > 1e-6)) continue;
                        const direction = sub(edge.points[1], edge.points[0]);
                        if (dot(cross(direction, sub(edge.third, edge.points[0])), cross(direction, sub(other.third, edge.points[0]))) >= 0) continue;
                        seams.push({ a: { chart: chart.id, page: chart.page, pixels: edge.pixels }, b: { chart: other.chart.id, page: other.chart.page, pixels: other.pixels } });
                    }
                    previous.push(edge); edges.set(key, previous);
                }
            }
        }
        if (pieces.size) seams.push(...receiverClippedEdgeSeams(visibleEdges));
    }
    return seams;
}

/** Bilinear footprints are in pixel-center space, identical to textureLod in the runtime shader. */
export function receiverSeamConstraints(seams, size, mip = 0) {
    const constraints = [], scale = 2**mip, width = size/scale;
    const footprint = (side, t) => {
        const p = [0, 1].map(c => (side.pixels[0][c]*(1-t)+side.pixels[1][c]*t)/scale-.5);
        const lo = p.map(Math.floor), f = p.map((v, c) => v-lo[c]);
        if (lo.some(v => v < 0 || v+1 >= width)) throw new Error('Receiver seam filter escaped page padding');
        return [0, 1].flatMap(y => [0, 1].map(x => ({
            index: side.page*width*width+(lo[1]+y)*width+lo[0]+x,
            weight: (x ? f[0] : 1-f[0])*(y ? f[1] : 1-f[1])
        })));
    };
    for (const seam of seams) {
        const intervals = Math.max(1, Math.ceil(Math.max(...[seam.a, seam.b].map(s => Math.hypot(...sub(s.pixels[1], s.pixels[0]))))/scale*2));
        for (let step = 0; step <= intervals; step++) {
            const weights = new Map();
            for (const [side, sign] of [[seam.a, 1], [seam.b, -1]]) for (const term of footprint(side, step/intervals)) {
                weights.set(term.index, (weights.get(term.index) ?? 0)+sign*term.weight);
            }
            const terms = [...weights].filter(([, weight]) => Math.abs(weight) > 1e-12);
            if (terms.length) constraints.push(terms);
        }
    }
    return constraints;
}

/** Projects only filter footprints onto continuity constraints; all other samples stay untouched. */
export function stitchReceiverSeams(pixels, constraints, iterations = 80) {
    const ids = [...pixels.keys()], indices = new Map(ids.map((id, i) => [id, i]));
    const values = new Float64Array(ids.length*3);
    for (let i = 0; i < ids.length; i++) values.set(pixels.get(ids[i]), i*3);
    const starts = new Uint32Array(constraints.length+1), counts = new Uint32Array(ids.length);
    const total = constraints.reduce((n, terms) => n+terms.length, 0);
    const refs = new Uint32Array(total), weights = new Float64Array(total), norms = new Float64Array(constraints.length);
    let cursor = 0;
    constraints.forEach((terms, constraint) => {
        starts[constraint] = cursor;
        for (const [id, w] of terms) {
            const i = indices.get(id); refs[cursor] = i; weights[cursor++] = w;
            counts[i]++; norms[constraint] += w*w;
        }
    });
    starts[constraints.length] = cursor;
    const measure = () => {
        let squared = 0, maximum = 0;
        for (let k = 0; k < constraints.length; k++) for (let c = 0; c < 3; c++) {
            let delta = 0;
            for (let j = starts[k]; j < starts[k+1]; j++) delta += values[refs[j]*3+c]*weights[j];
            squared += delta*delta; maximum = Math.max(maximum, Math.abs(delta));
        }
        return { rms: Math.sqrt(squared/Math.max(1, constraints.length*3)), maximum };
    };
    const before = measure();
    const changes = new Float64Array(values.length);
    for (let pass = 0; pass < iterations; pass++) {
        changes.fill(0);
        for (let k = 0; k < constraints.length; k++) for (let c = 0; c < 3; c++) {
            let delta = 0;
            for (let j = starts[k]; j < starts[k+1]; j++) delta += values[refs[j]*3+c]*weights[j];
            delta /= norms[k];
            for (let j = starts[k]; j < starts[k+1]; j++) changes[refs[j]*3+c] -= delta*weights[j];
        }
        for (let i = 0; i < ids.length; i++) if (counts[i]) for (let c = 0; c < 3; c++) values[i*3+c] = Math.max(0, values[i*3+c]+changes[i*3+c]/counts[i]);
    }
    for (let i = 0; i < ids.length; i++) for (let c = 0; c < 3; c++) pixels.get(ids[i])[c] = values[i*3+c];
    return { policy: RECEIVER_SEAM_POLICY, constraints: constraints.length, texels: pixels.size, iterations, before, after: measure() };
}

/** Chart-connected components are independent systems, keeping city-sized solves bounded. */
export function receiverSeamComponents(seams) {
    const parents = new Map();
    const root = id => {
        if (!parents.has(id)) parents.set(id, id);
        let at = id;
        while (parents.get(at) !== at) at = parents.get(at);
        while (id !== at) { const next = parents.get(id); parents.set(id, at); id = next; }
        return at;
    };
    for (const seam of seams) parents.set(root(seam.a.chart), root(seam.b.chart));
    const groups = new Map();
    for (const seam of seams) {
        const id = root(seam.a.chart);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(seam);
    }
    return [...groups.values()];
}

/** Solves connected surfaces with a 64 MiB cache of small linear page blocks. */
export async function stitchReceiverPageFiles(stage, seams, profile, pageCount) {
    const reports = [], components = receiverSeamComponents(seams);
    console.log(JSON.stringify({ phase: 'receiver_seam_components', components: components.length,
        maximumComponentEdges: components.reduce((n, c) => Math.max(n, c.length), 0) }));
    for (let mip = 0; mip < profile.mipLevels; mip++) {
        const size = profile.pageSize >> mip, area = size*size;
        const file = page => path.join(stage, `seam-input.${page}.mip${mip}.f32`);
        const cache = new Map(), handles = [], blockPixels = Math.min(65536, area);
        const flush = async block => {
            const entry = cache.get(block);
            if (entry.dirty) {
                let written = 0;
                while (written < entry.bytes.length) {
                    const { bytesWritten } = await handles[entry.page].write(entry.bytes, written, entry.bytes.length-written, entry.offset+written);
                    if (!bytesWritten) throw new Error('Incomplete receiver seam block write');
                    written += bytesWritten;
                }
            }
            cache.delete(block);
        };
        const load = async block => {
            const page = Math.floor(block*blockPixels/area), offset = (block*blockPixels%area)*16;
            if (page < 0 || page >= pageCount) throw new Error('Receiver seam page out of range');
            let entry = cache.get(block);
            if (entry) cache.delete(block);
            else {
                if (cache.size === 64) await flush(cache.keys().next().value);
                const bytes = Buffer.allocUnsafe(blockPixels*16);
                let read = 0;
                while (read < bytes.length) {
                    const { bytesRead } = await handles[page].read(bytes, read, bytes.length-read, offset+read);
                    if (!bytesRead) throw new Error('Incomplete receiver seam block read');
                    read += bytesRead;
                }
                entry = { bytes, data: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length/4), page, offset, dirty: false };
            }
            cache.set(block, entry); return entry;
        };
        const aggregate = { mip, policy: RECEIVER_SEAM_POLICY, components: components.length, constraints: 0, texels: 0,
            maximumComponentTexels: 0, before: { rms: 0, maximum: 0 }, after: { rms: 0, maximum: 0 } };
        try {
            for (let page = 0; page < pageCount; page++) {
                const handle = await open(file(page), 'r+'); handles.push(handle);
                if ((await handle.stat()).size !== area*16) throw new Error('Receiver seam page size mismatch');
            }
            for (const component of components) {
                const constraints = receiverSeamConstraints(component, profile.pageSize, mip), pixels = new Map(), byBlock = new Map();
                for (const terms of constraints) for (const [i] of terms) if (!pixels.has(i)) {
                    pixels.set(i, null); const block = Math.floor(i/blockPixels);
                    if (!byBlock.has(block)) byBlock.set(block, []); byBlock.get(block).push(i);
                }
                for (const [block, ids] of byBlock) {
                    const { data } = await load(block);
                    for (const i of ids) pixels.set(i, Array.from(data.subarray((i%blockPixels)*4, (i%blockPixels)*4+3)));
                }
                const report = stitchReceiverSeams(pixels, constraints);
                for (const [block, ids] of byBlock) {
                    const entry = await load(block); entry.dirty = true;
                    for (const i of ids) entry.data.set(pixels.get(i), (i%blockPixels)*4);
                }
                aggregate.constraints += report.constraints; aggregate.texels += report.texels;
                aggregate.maximumComponentTexels = Math.max(aggregate.maximumComponentTexels, report.texels);
                for (const phase of ['before', 'after']) {
                    aggregate[phase].rms += report[phase].rms**2*report.constraints;
                    aggregate[phase].maximum = Math.max(aggregate[phase].maximum, report[phase].maximum);
                }
            }
            for (const block of cache.keys()) await flush(block);
        } finally {
            for (const handle of handles) await handle.close();
        }
        for (const phase of ['before', 'after']) aggregate[phase].rms = Math.sqrt(aggregate[phase].rms/Math.max(1, aggregate.constraints));
        reports.push(aggregate);
        console.log(JSON.stringify({ phase: 'receiver_seam_mip', ...aggregate }));
    }
    return reports;
}
