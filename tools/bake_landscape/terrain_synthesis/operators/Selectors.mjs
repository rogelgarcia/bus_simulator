// Evaluates recipe selector expressions into [0, 1] masks on the current layer state (slope, curvature, height, flow, distance, cover, polygon, district).
// @ts-check
// Leaf selectors measure the current layers (slope and curvature by central differences of the height layer, flow by a Priority-Flood
// drainage of the current surface computed once per operator, distances from the plan layers) and map the value through a smoothstep
// between edge.from and edge.to (a descending edge selects below). Combinators take the min, max or product of their branches; invert
// flips any node. Every full-grid temporary is allocated in the operator scope, so an aborted operator releases them with its scope.
import { gaussianSmooth, smoothstep, terrainGradient } from '../../terrain_fields/TerrainFieldsGrid.mjs';
import { flowAccumulation, priorityFlood, resolveFlats } from '../../terrain_fields/TerrainFieldsHydrology.mjs';
import { polygonSignedDistance, rasterizePolygon } from './Polygons.mjs';

const FLOW_EXPONENT = 1.1;

function slopeDegrees(context, out) {
    const { grid, memory } = context, n = out.length, prefix = `op/${context.operator.id}/selector-`, { dhdx, dhdz } = terrainGradient(grid, context.layers.get('height'), memory, prefix);
    for (let i = 0; i < n; i++) out[i] = Math.atan(Math.hypot(dhdx[i], dhdz[i])) * 180 / Math.PI;
    memory.free(`${prefix}dhdx`, `${prefix}dhdz`);
}

function convexity(context, scaleMeters, out) {
    const { grid, memory } = context, { columns, rows, spacingX, spacingZ } = grid, heights = context.layers.get('height'), name = `op/${context.operator.id}/selector-smooth`;
    const smooth = gaussianSmooth(grid, heights, scaleMeters / Math.min(spacingX, spacingZ), memory, name);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column, west = smooth[row * columns + Math.max(0, column - 1)], east = smooth[row * columns + Math.min(columns - 1, column + 1)];
        const north = smooth[Math.max(0, row - 1) * columns + column], south = smooth[Math.min(rows - 1, row + 1) * columns + column];
        out[i] = -((west + east - 2 * smooth[i]) / (spacingX * spacingX) + (north + south - 2 * smooth[i]) / (spacingZ * spacingZ));
    }
    memory.free(name);
}

/** log10 of the contributing area (m^2) of the current height layer, computed once per operator and cached in its scope. @param {any} context */
export function operatorFlowLog10(context) {
    if (context.cache.flowLog10) return context.cache.flowLog10;
    const { grid, memory, seaLevel } = context, { columns, rows } = grid, n = columns * rows, heights = context.layers.get('height');
    const outlet = context.scope.allocate('selector-outlet', Uint8Array, n);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        outlet[i] = row === 0 || column === 0 || row === rows - 1 || column === columns - 1 || heights[i] < seaLevel ? 1 : 0;
    }
    const flood = priorityFlood(grid, heights, outlet, memory), flats = resolveFlats(grid, flood, memory), flow = flowAccumulation(grid, flood, flats, FLOW_EXPONENT, memory);
    const result = context.scope.allocate('selector-flow-log10', Float32Array, n);
    for (let i = 0; i < n; i++) result[i] = Math.log10(flow.area[i]);
    memory.free('flood/filled', 'flood/order', 'flats/flat', 'flats/mask', 'flats/processing', 'flow/area');
    context.scope.free('selector-outlet');
    context.cache.flowLog10 = result;
    return result;
}

function districtPolygons(context, ids) {
    if (!context.plan) throw new Error(`[Synthesis] operator ${context.operator.id}: a district selector needs plan-inputs before it`);
    return ids.map(id => {
        const district = context.plan.districts.find(entry => entry.id === id);
        if (!district) throw new Error(`[Synthesis] operator ${context.operator.id}: district ${id} is not in the plan (ids ${context.plan.districts.map(entry => entry.id).join(', ')})`);
        return district.polygon;
    });
}

function leaf(context, selector, out) {
    const { grid } = context, n = out.length, edge = selector.edge ?? null;
    const ramp = (values, scale = 1) => { for (let i = 0; i < n; i++) out[i] = smoothstep(edge.from, edge.to, values[i] * scale); };
    switch (selector.type) {
        case 'all': out.fill(1); break;
        case 'slope': slopeDegrees(context, out); ramp(out); break;
        case 'curvature': convexity(context, selector.scaleMeters ?? 0, out); ramp(out); break;
        case 'height': ramp(context.layers.get('height')); break;
        case 'flow': ramp(operatorFlowLog10(context)); break;
        case 'distance': ramp(context.layers.get(selector.feature === 'road' ? 'roadDistance' : 'shoreSigned')); break;
        case 'cover': {
            const cover = context.layers.get('cover'), classes = new Uint8Array(256);
            for (const id of selector.classes) classes[id] = 1;
            for (let i = 0; i < n; i++) out[i] = classes[cover[i]];
            break;
        }
        case 'polygon':
            if (edge) { polygonSignedDistance(grid, selector.polygon, out); ramp(out); }
            else { out.fill(0); rasterizePolygon(grid, selector.polygon, out, 1); }
            break;
        case 'district': {
            const polygons = districtPolygons(context, selector.ids);
            if (!edge) {
                const districtId = context.layers.get('districtId'), selected = new Uint8Array(256);
                for (const id of selector.ids) selected[id] = 1;
                for (let i = 0; i < n; i++) out[i] = selected[districtId[i]];
            } else {
                // union of districts: the maximum of their signed distances (exact outside, approximate only where polygons overlap)
                const scratch = context.scope.allocate(`selector-district-${context.cache.depth}`, Float32Array, n);
                out.fill(-Infinity);
                for (const polygon of polygons) { polygonSignedDistance(grid, polygon, scratch); for (let i = 0; i < n; i++) if (scratch[i] > out[i]) out[i] = scratch[i]; }
                context.scope.free(`selector-district-${context.cache.depth}`);
                ramp(out);
            }
            break;
        }
        default: throw new Error(`[Synthesis] operator ${context.operator.id}: unsupported selector ${selector.type}`);
    }
}

/**
 * Writes the selector's mask into `out` (values in [0, 1]).
 * @param {any} context operator context @param {any} selector validated selector @param {Float32Array} out @param {number} [depth]
 */
export function evaluateSelector(context, selector, out, depth = 0) {
    context.checkpoint();
    const n = out.length;
    if (['min', 'max', 'multiply'].includes(selector.type)) {
        context.cache.depth = depth + 1;
        evaluateSelector(context, selector.selectors[0], out, depth + 1);
        if (selector.selectors.length > 1) {
            const name = `selector-branch-${depth}`, scratch = context.scope.allocate(name, Float32Array, n);
            for (let k = 1; k < selector.selectors.length; k++) {
                evaluateSelector(context, selector.selectors[k], scratch, depth + 1);
                if (selector.type === 'min') { for (let i = 0; i < n; i++) if (scratch[i] < out[i]) out[i] = scratch[i]; }
                else if (selector.type === 'max') { for (let i = 0; i < n; i++) if (scratch[i] > out[i]) out[i] = scratch[i]; }
                else for (let i = 0; i < n; i++) out[i] *= scratch[i];
            }
            context.scope.free(name);
        }
    } else { context.cache.depth = depth; leaf(context, selector, out); }
    if (selector.invert) for (let i = 0; i < n; i++) out[i] = 1 - out[i];
    return out;
}
