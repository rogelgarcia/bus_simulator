// Builds stable, per-instance planar receiver charts without modifying base UVs.
// @ts-check
import { ReceiverCoverageAudit } from './ReceiverCoverageContract.js';
import { createRasterReceiverCharts } from './ReceiverRasterCharts.js';
import { canShareReceiverSurface } from './ReceiverSurfaceCharts.js';

export const RECEIVER_ATLAS_SCHEMA = 'bus-sim-receiver-atlas-v1';
export const RECEIVER_LIGHTMAP_PROFILE = Object.freeze({
    id: 'ai533.cycles.diffuse.preview64.v1',
    pageSize: 2048,
    texelSizeMeters: 680 / 16384,
    padding: 16,
    mipLevels: 4,
    samples: 64,
    diffuseBounces: 4,
    threads: 12,
    maxPages: 4
});

export function scalarReceiverExclusion(material) {
    if (!material.channelSupport?.indirect_irradiance?.supported) return 'unsupported_material';
    if (material.textureBindings.normalMap || material.textureBindings.bumpMap) return 'runtime_shading_normal';
    if (material.textureBindings.displacementMap) return 'runtime_displacement';
    if (material.customShaderTags?.length) return 'custom_shader';
    if (material.alpha.mode !== 'opaque') return 'alpha_surface';
    if (material.metalness > 0 || material.textureBindings.metalnessMap) return 'metallic_bake_receiver';
    return null;
}

/** @param {any} mapping @param {any} material @param {any} profile */
export function receiverMappingExclusion(mapping, material, profile) {
    if (profile.coverage && (!mapping.channelRelevance.direct_receiver || !mapping.channelRelevance.indirect_irradiance)) return 'source_channel_disabled';
    if (profile.irradianceRepresentation === 'surface-diffuse-v1') {
        if (!material.channelSupport.indirect_irradiance.supported || !material.channelSupport.direct_receiver.supported) return 'unsupported_material';
        if (material.alpha.mode !== 'opaque') return 'alpha_surface';
        if (material.textureBindings.displacementMap) return 'runtime_displacement';
        return null;
    }
    let reason = scalarReceiverExclusion(material);
    if (profile.directional && reason === 'runtime_shading_normal') reason = scalarReceiverExclusion({ ...material,
        textureBindings: { ...material.textureBindings, normalMap: null, bumpMap: null } });
    return reason;
}

function accessorReader(parsed, accessor) {
    const bytes = parsed.getBuffer(accessor.bufferId);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const readers = { f32: ['getFloat32', 4], u32: ['getUint32', 4], u16: ['getUint16', 2], u8: ['getUint8', 1] };
    const reader = readers[accessor.componentType];
    if (!reader || accessor.normalized) throw new Error('Receiver atlas requires unnormalized position/index accessors.');
    return (index, component = 0) => view[reader[0]](accessor.byteOffset + index * accessor.byteStride + component * reader[1], true);
}

function worldPoint(read, index, matrix) {
    const x = read(index, 0), y = read(index, 1), z = read(index, 2);
    return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
        matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
        matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => a.map((v) => v / Math.hypot(...a));

/** The parsed input must already have passed the AI 528 semantic validator. */
export function createReceiverAtlas(parsed, profile = RECEIVER_LIGHTMAP_PROFILE, layout = null) {
    const { pageSize, texelSizeMeters, padding, maxPages } = profile;
    if (!Number.isInteger(pageSize) || pageSize < 64 || pageSize > 4096 || (pageSize & (pageSize - 1))
        || !Number.isInteger(profile.mipLevels) || profile.mipLevels < 1 || profile.mipLevels > 4
        || !(texelSizeMeters > 0) || !Number.isInteger(padding) || padding < 2 ** (profile.mipLevels - 1)
        || padding * 2 >= pageSize || !Number.isInteger(maxPages) || maxPages < 1) throw new Error('Invalid receiver atlas profile.');
    const manifest = parsed.manifest;
    if (profile.chartLayout && (profile.chartLayout !== 'blender-smart-project-v1'
        || profile.irradianceRepresentation !== 'surface-diffuse-v1' || !profile.coverage
        || layout?.schema !== profile.chartLayout || layout.sourceHash !== manifest.hashes.resolvedSource)) throw new Error('Receiver layout/source mismatch.');
    if (profile.packing && (profile.packing !== 'height-shelves-v1' || !profile.coverage)) throw new Error('Unsupported complete atlas packing.');
    if (profile.rasterCoverage && (!['independent-triangle-centroids-v1','continuous-planar-surfaces-v1'].includes(profile.rasterCoverage) || !profile.chartLayout)) throw new Error('Unsupported receiver raster coverage.');
    const layoutCharts = new Map(), layoutDegenerates = new Map();
    const mappingIds = new Set(manifest.receiverMappings.map(m => m.id)), chartIds = new Set();
    for (const chart of layout?.charts ?? []) {
        if (!mappingIds.has(chart.mappingId) || chartIds.has(chart.id)) throw new Error('Receiver layout inventory mismatch.');
        chartIds.add(chart.id);
        const list = layoutCharts.get(chart.mappingId) ?? [];
        list.push(chart); layoutCharts.set(chart.mappingId, list);
    }
    for (const entry of layout?.degenerates ?? []) {
        if (!mappingIds.has(entry.mappingId) || layoutDegenerates.has(entry.mappingId)) throw new Error('Invalid degenerate receiver inventory.');
        layoutDegenerates.set(entry.mappingId, entry.offsets);
    }
    const coverageAudit = profile.coverage ? new ReceiverCoverageAudit(manifest, profile) : null;
    const geometries = new Map(manifest.geometries.map((v) => [v.id, v]));
    const materials = new Map(manifest.materials.map((v) => [v.id, v]));
    const instances = new Map(manifest.meshInstances.map((v) => [v.id, v]));
    const objects = new Map();
    const charts = [];
    const exclusions = {};
    let tableEntries = 1;
    for (const mapping of [...manifest.receiverMappings].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
        const material = materials.get(mapping.materialId);
        const reason = receiverMappingExclusion(mapping, material, profile);
        coverageAudit?.recordMapping(mapping, reason);
        if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + mapping.count / 3; continue; }
        const instance = instances.get(mapping.meshInstanceId);
        const geometry = geometries.get(mapping.geometryId);
        let object = objects.get(mapping.objectId);
        if (!object) {
            const placements = manifest.meshInstances.filter((v) => v.objectId === mapping.objectId)
                .sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0) || a.id.localeCompare(b.id, 'en'));
            object = { id: mapping.objectId, geometryId: mapping.geometryId, base: tableEntries,
                referenceCount: geometry.referenceCount, instances: placements.map((v) => ({ id: v.id, sourceIndex: v.sourceIndex ?? 0 })) };
            tableEntries += geometry.referenceCount * placements.length;
            objects.set(object.id, object);
        }
        const read = accessorReader(parsed, geometry.attributes.position);
        const index = geometry.index ? accessorReader(parsed, geometry.index) : (i) => i;
        if (profile.chartLayout) {
            const seen = new Set();
            const areaAt = (offset) => {
                if (!Number.isInteger(offset) || offset % 3 || offset < mapping.start || offset + 3 > mapping.start + mapping.count || seen.has(offset)) throw new Error('Receiver layout triangle inventory mismatch: ' + mapping.id);
                seen.add(offset);
                const p = [0, 1, 2].map(c => worldPoint(read, index(offset + c), instance.matrixThreeWorld));
                return Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2;
            };
            for (const offset of layoutDegenerates.get(mapping.id) ?? []) {
                if (areaAt(offset) !== 0) throw new Error('Receiver layout discarded a nondegenerate triangle.');
                coverageAudit.recordDegenerate(mapping.id);
            }
            for (const supplied of layoutCharts.get(mapping.id) ?? []) {
                const chart = { ...supplied, objectId: object.id, instanceId: instance.id, chunkId: mapping.chunkId,
                    triangles:supplied.triangles.map(t=>({...t})), min: [Infinity, Infinity], max: [-Infinity, -Infinity], area: 0 };
                for (const triangle of chart.triangles) {
                    const area = areaAt(triangle.offset);
                    if (!(area > 0) || triangle.uv.length !== 3 || triangle.uv.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw new Error('Invalid receiver UV triangle.');
                    const [a, b, c] = triangle.uv;
                    if ((b[0]-a[0])*(c[1]-a[1]) === (b[1]-a[1])*(c[0]-a[0])) throw new Error('Singular receiver UV triangle.');
                    chart.area += area;
                    triangle.area = area;
                    for (const uv of triangle.uv) for (let c = 0; c < 2; c++) {
                        chart.min[c] = Math.min(chart.min[c], uv[c]); chart.max[c] = Math.max(chart.max[c], uv[c]);
                    }
                }
                // Keep even a tiny bevel island rasterizable; this increases its density, never removes a face.
                chart.texelsPerMeter = chart.max.map((v, c) => Math.max(2, (v-chart.min[c])/texelSizeMeters)/(v-chart.min[c]));
                const continuous=profile.rasterCoverage==='continuous-planar-surfaces-v1'&&canShareReceiverSurface(chart,
                    t=>[0,1,2].map(c=>worldPoint(read,index(t.offset+c),instance.matrixThreeWorld)));
                for (const raster of profile.rasterCoverage ? createRasterReceiverCharts(chart,texelSizeMeters,continuous) : [chart]) {
                    raster.width = Math.ceil((raster.max[0]-raster.min[0])*raster.texelsPerMeter[0])+ (raster.pixelOffset ? 2 : 1) + padding*2;
                    raster.height = Math.ceil((raster.max[1]-raster.min[1])*raster.texelsPerMeter[1])+ (raster.pixelOffset ? 2 : 1) + padding*2;
                    if (raster.width > pageSize || raster.height > pageSize) coverageAudit.recordOversized(raster);
                    else charts.push(raster);
                }
            }
            continue;
        }
        const planes = new Map();
        for (let offset = mapping.start; offset < mapping.start + mapping.count; offset += 3) {
            const points = [0, 1, 2].map((corner) => worldPoint(read, index(offset + corner), instance.matrixThreeWorld));
            const normalRaw = cross(sub(points[1], points[0]), sub(points[2], points[0]));
            const area = Math.hypot(...normalRaw) / 2;
            if (coverageAudit ? area === 0 : area < 1e-10) { coverageAudit?.recordDegenerate(mapping.id); continue; }
            const normal = normalize(normalRaw);
            const plane = [...normal.map((v) => Math.round(v * 1e5)), Math.round(dot(normal, points[0]) * 1e4)].join(',');
            let chart = planes.get(plane);
            if (!chart) {
                const axis = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
                const right = normalize(cross(axis, normal));
                chart = { id: `${mapping.id}/plane/${plane}`, mappingId: mapping.id, instanceId: instance.id,
                    objectId: object.id, chunkId: mapping.chunkId, right, up: cross(normal, right),
                    min: [Infinity, Infinity], max: [-Infinity, -Infinity], triangles: [], area: 0 };
                planes.set(plane, chart);
                if (profile.directional) Object.assign(chart, { normal, distance: dot(normal, points[0]),
                    normalMapped: !!(material.textureBindings.normalMap || material.textureBindings.bumpMap) });
            }
            const uv = points.map((point) => [dot(point, chart.right), dot(point, chart.up)]);
            for (const point of uv) for (let c = 0; c < 2; c++) {
                chart.min[c] = Math.min(chart.min[c], point[c]); chart.max[c] = Math.max(chart.max[c], point[c]);
            }
            chart.triangles.push(profile.directional || coverageAudit ? { offset, uv, area } : { offset, uv }); chart.area += area;
        }
        const candidates = profile.directional || coverageAudit ? [...planes.values()].flatMap((chart) => partitionChart(chart,
            Math.min(profile.patchSizeMeters ?? Infinity, (pageSize - padding * 2 - 1) * texelSizeMeters))) : [...planes.values()];
        for (const chart of candidates) {
            if (profile.directional && chart.area < (profile.minimumChartArea ?? 0)) {
                exclusions.subtexel_detail_budget = (exclusions.subtexel_detail_budget ?? 0) + chart.triangles.length;
                continue;
            }
            chart.width = Math.max(2, Math.ceil((chart.max[0] - chart.min[0]) / texelSizeMeters) + 1) + padding * 2;
            chart.height = Math.max(2, Math.ceil((chart.max[1] - chart.min[1]) / texelSizeMeters) + 1) + padding * 2;
            if (chart.width > pageSize || chart.height > pageSize) {
                coverageAudit?.recordOversized(chart);
                exclusions.chart_exceeds_page = (exclusions.chart_exceeds_page ?? 0) + chart.triangles.length;
                continue;
            }
            charts.push(chart);
        }
    }
    charts.sort((a, b) => b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : 1));
    if (profile.directional && profile.focus) {
        const priority = (chart) => {
            const u = (chart.min[0] + chart.max[0]) / 2, v = (chart.min[1] + chart.max[1]) / 2;
            const center = chart.right.map((x, i) => x * u + chart.up[i] * v + chart.normal[i] * chart.distance);
            return Math.floor(Math.hypot(center[0] - profile.focus[0], center[2] - profile.focus[2]) / 40) * 4
                + (center[1] > 20 ? 3 : Math.abs(chart.normal[1]) < .5 ? 0 : 1);
        };
        charts.sort((a, b) => priority(a) - priority(b)
            || b.area - a.area || b.height - a.height || (a.id < b.id ? -1 : 1));
    }
    const pages = [];
    const accepted = [];
    for (const chart of charts) {
        if (profile.packing === 'height-shelves-v1') {
            let page = pages.at(-1);
            if (!page || page.y + chart.height > pageSize) {
                page = { index: pages.length, x: 0, y: 0, rowHeight: 0 }; pages.push(page);
            }
            if (page.x + chart.width > pageSize) { page.y += page.rowHeight; page.x = 0; page.rowHeight = 0; }
            if (page.y + chart.height > pageSize) {
                page = { index: pages.length, x: 0, y: 0, rowHeight: 0 }; pages.push(page);
            }
            accepted.push({ ...chart, page: page.index, x: page.x, y: page.y });
            page.x += chart.width; page.rowHeight = Math.max(page.rowHeight, chart.height);
            continue;
        }
        if (profile.directional || coverageAudit) {
            const placement = placeRectangle(chart, pages, pageSize, coverageAudit ? Infinity : maxPages);
            if (placement) accepted.push({ ...chart, ...placement });
            else exclusions.preview_page_budget = (exclusions.preview_page_budget ?? 0) + chart.triangles.length;
            continue;
        }
        let placement;
        for (const page of pages) {
            const shelf = page.shelves.find((v) => v.height >= chart.height && v.x + chart.width <= pageSize);
            if (shelf) { placement = { page: page.index, x: shelf.x, y: shelf.y }; shelf.x += chart.width; break; }
            if (page.usedHeight + chart.height <= pageSize) {
                placement = { page: page.index, x: 0, y: page.usedHeight };
                page.shelves.push({ x: chart.width, y: page.usedHeight, height: chart.height }); page.usedHeight += chart.height; break;
            }
        }
        if (!placement) {
            if (pages.length >= maxPages) {
                exclusions.preview_page_budget = (exclusions.preview_page_budget ?? 0) + chart.triangles.length; continue;
            }
            placement = { page: pages.length, x: 0, y: 0 };
            pages.push({ index: pages.length, usedHeight: chart.height, shelves: [{ x: chart.width, y: 0, height: chart.height }] });
        }
        accepted.push({ ...chart, ...placement });
    }
    const coverage = coverageAudit?.finish(accepted, pages.length);
    if (!accepted.length) throw new Error('No eligible scalar receivers fit this atlas profile.');
    const usedObjects = new Set(accepted.map((v) => v.objectId));
    if (profile.directional) {
        tableEntries = 1;
        for (const object of objects.values()) if (usedObjects.has(object.id)) {
            object.base = tableEntries;
            tableEntries += object.referenceCount * object.instances.length;
        }
    }
    const tableWidth = 2048;
    const tableHeight = Math.ceil(tableEntries / tableWidth);
    if (tableEntries > 2 ** 24) throw new Error('Receiver mapping indices exceed exact float32 integer precision.');
    if (tableHeight > 16384) throw new Error('Receiver mapping table exceeds the supported texture height.');
    const coordinates = new Float32Array(tableWidth * tableHeight * 4);
    for (const chart of accepted) {
        const object = objects.get(chart.objectId);
        const instance = instances.get(chart.instanceId);
        for (const triangle of chart.triangles) for (let corner = 0; corner < 3; corner++) {
            const at = (object.base + (instance.sourceIndex ?? 0) * object.referenceCount + triangle.offset + corner) * 4;
            const uv = triangle.uv[corner].map((v, c) => ((v - chart.min[c]) * (chart.texelsPerMeter?.[c] ?? 1/texelSizeMeters) + padding + (chart.pixelOffset?.[c] ?? 0.5) + (c ? chart.y : chart.x)) / pageSize);
            coordinates.set([...uv, chart.page, 1], at);
        }
    }
    return { schema: RECEIVER_ATLAS_SCHEMA, profile: { ...profile }, pageCount: pages.length,
        tableWidth, tableHeight, objects: [...objects.values()].filter((v) => usedObjects.has(v.id)),
        charts: accepted, coordinates, ...(coverage ? { coverage } : {}),
        statistics: { charts: accepted.length, triangles: accepted.reduce((s, c) => s + c.triangles.length, 0),
            exclusions, surfaceArea: accepted.reduce((s, c) => s + c.area, 0),
            occupancy: accepted.reduce((s, c) => s + c.area / texelSizeMeters ** 2, 0) / (pages.length * pageSize ** 2),
            ...(profile.directional ? { normalMappedTriangles: accepted.filter((c) => c.normalMapped).reduce((s, c) => s + c.triangles.length, 0) } : {}) } };
}

function partitionChart(chart, limit) {
    if (Math.max(chart.max[0] - chart.min[0], chart.max[1] - chart.min[1]) <= limit || chart.triangles.length === 1) return [chart];
    const axis = chart.max[0] - chart.min[0] >= chart.max[1] - chart.min[1] ? 0 : 1;
    const sorted = [...chart.triangles].sort((a, b) => a.uv.reduce((s, v) => s + v[axis], 0) - b.uv.reduce((s, v) => s + v[axis], 0) || a.offset - b.offset);
    const middle = Math.floor(sorted.length / 2);
    return [sorted.slice(0, middle), sorted.slice(middle)].flatMap((triangles, side) => {
        const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
        for (const triangle of triangles) for (const uv of triangle.uv) for (let c = 0; c < 2; c++) {
            min[c] = Math.min(min[c], uv[c]); max[c] = Math.max(max[c], uv[c]);
        }
        return partitionChart({ ...chart, id: chart.id + '/split/' + side, min, max, triangles,
            area: triangles.reduce((s, t) => s + t.area, 0) }, limit);
    });
}

function placeRectangle(chart, pages, size, maximum) {
    let best = null;
    for (const page of pages) for (const free of page.free) if (free.width >= chart.width && free.height >= chart.height) {
        const score = Math.min(free.width - chart.width, free.height - chart.height);
        if (!best || score < best.score) best = { page, free, score };
    }
    if (!best) {
        if (pages.length === maximum) return null;
        const page = { index: pages.length, free: [{ x: 0, y: 0, width: size, height: size }] };
        pages.push(page); best = { page, free: page.free[0] };
    }
    const used = { x: best.free.x, y: best.free.y, width: chart.width, height: chart.height };
    const pieces = [];
    for (const r of best.page.free) {
        if (used.x >= r.x + r.width || used.x + used.width <= r.x || used.y >= r.y + r.height || used.y + used.height <= r.y) { pieces.push(r); continue; }
        if (used.x > r.x) pieces.push({ ...r, width: used.x - r.x });
        if (used.x + used.width < r.x + r.width) pieces.push({ ...r, x: used.x + used.width, width: r.x + r.width - used.x - used.width });
        if (used.y > r.y) pieces.push({ ...r, height: used.y - r.y });
        if (used.y + used.height < r.y + r.height) pieces.push({ ...r, y: used.y + used.height, height: r.y + r.height - used.y - used.height });
    }
    best.page.free = pieces.filter((r, i) => !pieces.some((v, j) => i !== j && v.x <= r.x && v.y <= r.y
        && v.x + v.width >= r.x + r.width && v.y + v.height >= r.y + r.height
        && (v.width * v.height > r.width * r.height || j < i)));
    return { page: best.page.index, x: used.x, y: used.y };
}
