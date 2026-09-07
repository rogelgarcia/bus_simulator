// Uses the runtime's coplanar ownership plan to recover visible atlas boundaries.
import { planReceiverCoplanarOwnership } from '../../src/app/illumination/receiver_lightmaps/ReceiverCoplanarOwnership.js';

const sub = (a, b) => a.map((v, c) => v-b[c]);
const dot = (a, b) => a.reduce((sum, v, c) => sum+v*b[c], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a, b, t) => a.map((v, c) => v+(b[c]-v)*t);
const planeKey = e => [...e.normal.map(v => Math.round(v*1e6)), Math.round(dot(e.normal, e.points[0])*1e5)].join('/');

/** Compact storage keeps millions of city boundary edges out of the JS object heap. */
export function createReceiverBoundaryInventory() {
    const planes = new Map(), charts = [], indices = new Map(), width = 17;
    return {
        add(edge) {
            if (!indices.has(edge.chart)) { indices.set(edge.chart, charts.length); charts.push(edge.chart); }
            const key = planeKey(edge);
            let plane = planes.get(key);
            if (!plane) { plane = { blocks:[], data:new Float64Array(width*8), count:0 }; planes.set(key,plane); }
            if (plane.count*width === plane.data.length) {
                if (plane.count === 4096) { plane.blocks.push(plane.data); plane.data = new Float64Array(width*4096); plane.count = 0; }
                else { const next = new Float64Array(plane.data.length*2); next.set(plane.data); plane.data = next; }
            }
            plane.data.set([indices.get(edge.chart), ...edge.normal, ...edge.points.flat(), ...edge.pixels.flat(), ...edge.third],plane.count++*width);
        },
        *seams() {
            for (const [key,plane] of planes) {
                const edges = [];
                for (const block of [...plane.blocks,plane.data.subarray(0,plane.count*width)]) for (let i=0;i<block.length;i+=width) {
                    const values = Array.from(block.subarray(i,i+width));
                    edges.push({chart:charts[values[0]],normal:values.slice(1,4),points:[values.slice(4,7),values.slice(7,10)],
                        pixels:[values.slice(10,12),values.slice(12,14)],third:values.slice(14,17)});
                }
                yield* receiverClippedEdgeSeams(edges,{crossInstances:true});
                planes.delete(key);
            }
        }
    };
}

/** Keep the same source ordering, material grouping and interpolation as runtime clipping. */
export function receiverVisiblePieces(geometry, members) {
    const offsets = members.flatMap(chart => chart.triangles.map(t => t.offset)).sort((a, b) => a-b);
    const positions = new Float32Array(offsets.length*9), groups = new Int32Array(offsets.length);
    offsets.forEach((offset, i) => {
        for (let corner = 0; corner < 3; corner++) for (let c = 0; c < 3; c++) {
            positions[i*9+corner*3+c] = geometry.position(geometry.index(offset+corner), c);
        }
        groups[i] = geometry.groups.find(g => offset >= g.start && offset < g.start+g.count)?.materialIndex ?? 0;
    });
    const plan = planReceiverCoplanarOwnership(positions, groups);
    return new Map([...plan.patches].map(([i, pieces]) => [offsets[i], pieces]));
}

/** Authored and clipped T-junctions require partial-edge matching in addition to shared endpoints. */
export function receiverClippedEdgeSeams(edges, { crossInstances = false } = {}) {
    const planes = new Map(), seams = [];
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i], key = planeKey(e);
        if (!planes.has(key)) planes.set(key, []);
        planes.get(key).push({ ...e, id: i });
    }
    for (const entries of planes.values()) {
        const axis = entries[0].normal.map(Math.abs).indexOf(Math.max(...entries[0].normal.map(Math.abs)));
        const project = p => p.filter((_, c) => c !== axis), bounds = [[Infinity, -Infinity], [Infinity, -Infinity]];
        for (const e of entries) {
            e.bounds = [0,1].map(c => [Math.min(...e.points.map(p => project(p)[c])), Math.max(...e.points.map(p => project(p)[c]))]);
            for (let c = 0; c < 2; c++) { bounds[c][0] = Math.min(bounds[c][0], e.bounds[c][0]); bounds[c][1] = Math.max(bounds[c][1], e.bounds[c][1]); }
        }
        const resolution = Math.min(64, Math.ceil(Math.sqrt(entries.length))), grid = new Map();
        const step = bounds.map(b => Math.max(1e-6, (b[1]-b[0])/resolution));
        const cells = e => e.bounds.map((b,c) => b.map((v,i) => Math.max(0, Math.min(resolution-1, Math.floor((v-bounds[c][0]+(i ? 1e-6 : -1e-6))/step[c])))));
        for (const e of entries) {
            const cell = cells(e);
            for (let y = cell[1][0]; y <= cell[1][1]; y++) for (let x = cell[0][0]; x <= cell[0][1]; x++) {
                const key = y*resolution+x;
                if (!grid.has(key)) grid.set(key, []); grid.get(key).push(e);
            }
        }
        for (const e of entries) {
            const cell = cells(e), candidates = new Set();
            for (let y = cell[1][0]; y <= cell[1][1]; y++) for (let x = cell[0][0]; x <= cell[0][1]; x++) for (const other of grid.get(y*resolution+x) ?? []) candidates.add(other);
            const direction = sub(e.points[1], e.points[0]), length2 = dot(direction, direction);
            if (length2 < 1e-16) continue;
            for (const other of candidates) {
                if (other.chart === e.chart || other.id <= e.id || dot(e.normal, other.normal) < 1-1e-10) continue;
                if (crossInstances && other.chart.instanceId === e.chart.instanceId) continue;
                if (other.points.some(p => Math.hypot(...cross(direction, sub(p, e.points[0])))/Math.sqrt(length2) > 1e-6)) continue;
                if (dot(cross(direction, sub(e.third, e.points[0])), cross(direction, sub(other.third, e.points[0]))) >= 0) continue;
                const t = other.points.map(p => dot(sub(p, e.points[0]), direction)/length2);
                const lo = Math.max(0, Math.min(...t)), hi = Math.min(1, Math.max(...t));
                if ((hi-lo)*Math.sqrt(length2) <= 1e-6) continue;
                // Exact full edges were already handled by the endpoint inventory.
                if (!crossInstances && Math.abs(lo) < 1e-12 && Math.abs(hi-1) < 1e-12 && Math.abs(Math.min(...t)) < 1e-12 && Math.abs(Math.max(...t)-1) < 1e-12) continue;
                seams.push({
                    a: { chart: e.chart.id, page: e.chart.page, pixels: [lo,hi].map(v => mix(...e.pixels, v)) },
                    b: { chart: other.chart.id, page: other.chart.page, pixels: [lo,hi].map(v => mix(...other.pixels, (v-t[0])/(t[1]-t[0]))) }
                });
            }
        }
    }
    return seams;
}
