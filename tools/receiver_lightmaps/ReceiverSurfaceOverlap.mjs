// Finds hidden texels behind nearly coincident, same-facing opaque receivers.
// @ts-check

export const RECEIVER_SURFACE_OVERLAP_POLICY = Object.freeze({
    id: 'hidden-near-coplanar-chart-extension-v1',
    maximumSeparationMeters: .002,
    planeToleranceMeters: 1e-6,
    normalDotMinimum: 1 - 1e-10
});

const subtract = (a, b) => a.map((v, c) => v - b[c]);
const dot = (a, b) => a.reduce((sum, v, c) => sum + v * b[c], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

function readAccessor(parsed, accessor) {
    const bytes = parsed.getBuffer(accessor.bufferId);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const methods = { f32: ['getFloat32', 4], u32: ['getUint32', 4], u16: ['getUint16', 2], u8: ['getUint8', 1] };
    const [method, width] = methods[accessor.componentType] ?? [];
    if (!method || accessor.normalized) throw new Error('Unsupported surface-overlap accessor');
    return (index, component = 0) => view[method](accessor.byteOffset + index * accessor.byteStride + component * width, true);
}

function worldPoint(read, index, m) {
    const x = read(index, 0), y = read(index, 1), z = read(index, 2);
    return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
}

function triangleReader(parsed) {
    const geometry = new Map(parsed.manifest.geometries.map(g => [g.id, {
        position: readAccessor(parsed, g.attributes.position),
        index: g.index ? readAccessor(parsed, g.index) : i => i
    }]));
    const instances = new Map(parsed.manifest.meshInstances.map(i => [i.id, i]));
    return function* (charts) {
        for (const chart of charts) {
            const instance = instances.get(chart.instanceId), g = geometry.get(instance.geometryId);
            for (const triangle of chart.triangles) {
                const points = [0, 1, 2].map(c => worldPoint(g.position, g.index(triangle.offset + c), instance.matrixThreeWorld));
                const n = cross(subtract(points[1], points[0]), subtract(points[2], points[0]));
                const length = Math.hypot(...n), normal = n.map(v => v / length);
                if (!(length > 0)) throw new Error('Degenerate triangle escaped receiver coverage validation');
                const distance = dot(points[0], normal);
                yield { chart, triangle, points, normal, distance,
                    normalKey: normal.map(v => Math.round(v * 1e5)).join(','),
                    distanceKey: Math.round(distance * 1e6) };
            }
        }
    };
}

function barycentric(p, triangle) {
    const [a, b, c] = triangle;
    const determinant = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    const u = ((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/determinant;
    const v = ((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/determinant;
    return [u, v, 1-u-v];
}

function inside(weights) { return weights.every(v => v >= -1e-7 && v <= 1+1e-7); }

function rasterOverlap(lower, upper, masks, profile, report) {
    const policy = RECEIVER_SURFACE_OVERLAP_POLICY;
    if (dot(lower.normal, upper.normal) < policy.normalDotMinimum) return;
    const gaps = upper.points.map(p => dot(subtract(p, lower.points[0]), lower.normal));
    if (gaps.some(gap => gap <= policy.planeToleranceMeters || gap > policy.maximumSeparationMeters)) return;
    const axis = lower.normal.map(Math.abs).indexOf(Math.max(...lower.normal.map(Math.abs)));
    const project = p => p.filter((_, c) => c !== axis);
    const a = lower.points.map(project);
    const b = upper.points.map((p, i) => project(p.map((v, c) => v-gaps[i]*lower.normal[c])));
    for (let c = 0; c < 2; c++) {
        if (Math.max(...a.map(p => p[c])) < Math.min(...b.map(p => p[c]))
            || Math.max(...b.map(p => p[c])) < Math.min(...a.map(p => p[c]))) return;
    }
    const chart = lower.chart;
    const texel = uv => uv.map((v, c) => (v-chart.min[c])*chart.texelsPerMeter[c]+profile.padding+(chart.pixelOffset?.[c] ?? .5));
    const lowerPixels = lower.triangle.uv.map(texel);
    const upperPixels = b.map(p => {
        const weights = barycentric(p, a);
        return [0, 1].map(c => lowerPixels.reduce((sum, v, i) => sum + v[c]*weights[i], 0));
    });
    const minimum = [0, 1].map(c => Math.max(0, Math.ceil(Math.min(...upperPixels.map(p => p[c]))-.5-1e-6)));
    const maximum = [chart.width-1, chart.height-1].map((limit, c) => Math.min(limit, Math.floor(Math.max(...upperPixels.map(p => p[c]))-.5+1e-6)));
    let mask = masks.get(chart.page), count = 0;
    for (let y = minimum[1]; y <= maximum[1]; y++) for (let x = minimum[0]; x <= maximum[0]; x++) {
        const center = [x+.5, y+.5];
        if (!inside(barycentric(center, lowerPixels)) || !inside(barycentric(center, upperPixels))) continue;
        if (!mask) { mask = new Uint8Array(profile.pageSize**2); masks.set(chart.page, mask); }
        const index = (chart.y+y)*profile.pageSize+chart.x+x;
        if (!mask[index]) { mask[index] = 1; count++; }
    }
    if (count) { report.hiddenTexels += count; report.overlappingTrianglePairs++; }
}

/**
 * Inputs are validated source geometry and its complete, packed receiver atlas.
 * Only hidden lower-surface texels are masked. Real gaps, back faces and exposed
 * shading samples remain untouched; no names, materials or world axes select receivers.
 * @param {any} parsed
 * @param {any[]} charts
 * @param {any} profile
 */
export function createReceiverHiddenTexelMasks(parsed, charts, profile) {
    if (!(profile.pageSize > 0) || !(profile.padding >= 0)) throw new Error('Invalid surface-overlap profile');
    const readTriangles = triangleReader(parsed), normals = new Map();
    // Collect planes first so millions of unrelated facade triangles need not
    // remain resident. Quantized keys only shortlist; exact geometry proves overlap.
    for (const t of readTriangles(charts)) {
        let group = normals.get(t.normalKey);
        if (!group) { group = new Map(); normals.set(t.normalKey, group); }
        if (!group.has(t.distanceKey)) group.set(t.distanceKey, { key: t.distanceKey, triangles: [] });
    }
    const candidates = [], active = new Set();
    for (const [normalKey, group] of normals) {
        const planes = [...group.values()].sort((a, b) => a.key-b.key);
        for (let i = 0; i < planes.length; i++) for (let j = i+1; j < planes.length; j++) {
            if ((planes[j].key-planes[i].key)*1e-6 > RECEIVER_SURFACE_OVERLAP_POLICY.maximumSeparationMeters+2e-6) break;
            candidates.push([planes[i], planes[j]]);
            active.add(normalKey+'/'+planes[i].key); active.add(normalKey+'/'+planes[j].key);
        }
    }
    for (const t of readTriangles(charts)) if (active.has(t.normalKey+'/'+t.distanceKey)) {
        normals.get(t.normalKey).get(t.distanceKey).triangles.push(t);
    }
    const masks = new Map(), report = { policy: RECEIVER_SURFACE_OVERLAP_POLICY, hiddenTexels: 0, overlappingTrianglePairs: 0 };
    for (const [lower, upper] of candidates) for (const a of lower.triangles) for (const b of upper.triangles) {
        rasterOverlap(a, b, masks, profile, report);
    }
    return { masks, report };
}
