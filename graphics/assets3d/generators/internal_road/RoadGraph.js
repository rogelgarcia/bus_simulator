// graphics/assets3d/generators/internal_road/RoadGraph.js
import { TILE, DIR } from '../../../../src/city/CityMap.js';
import { bitCount4, clamp } from './RoadMath.js';

const DIRS = [
    { key: 'N', bit: DIR.N, dx: 0, dy: 1, axis: 'NS', opp: 'S' },
    { key: 'E', bit: DIR.E, dx: 1, dy: 0, axis: 'EW', opp: 'W' },
    { key: 'S', bit: DIR.S, dx: 0, dy: -1, axis: 'NS', opp: 'N' },
    { key: 'W', bit: DIR.W, dx: -1, dy: 0, axis: 'EW', opp: 'E' }
];

function widthForAxis(lanes, axis, laneWidth, shoulder, ts) {
    const lanesNS = (lanes.n ?? 0) + (lanes.s ?? 0);
    const lanesEW = (lanes.e ?? 0) + (lanes.w ?? 0);
    const raw = axis === 'NS'
        ? laneWidth * lanesNS + 2 * shoulder
        : laneWidth * lanesEW + 2 * shoulder;
    return clamp(raw, 0.5, ts);
}

export function buildRoadGraph(map, { laneWidth = 3.2, shoulder = 0.35 } = {}) {
    const w = map.width;
    const h = map.height;
    const ts = map.tileSize;
    const count = w * h;

    const widthNS = new Float32Array(count);
    const widthEW = new Float32Array(count);
    const isRoad = new Uint8Array(count);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = map.index(x, y);
            if (map.kind[idx] !== TILE.ROAD) continue;
            const lanes = map.getLanesAtIndex(idx);
            widthNS[idx] = widthForAxis(lanes, 'NS', laneWidth, shoulder, ts);
            widthEW[idx] = widthForAxis(lanes, 'EW', laneWidth, shoulder, ts);
            isRoad[idx] = 1;
        }
    }

    const nodeAt = new Int32Array(count);
    nodeAt.fill(-1);

    const nodes = [];
    const eps = 1e-3;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = map.index(x, y);
            if (!isRoad[idx]) continue;

            const conn = map.conn[idx] ?? 0;
            const degree = bitCount4(conn);
            const hasN = (conn & DIR.N) !== 0;
            const hasE = (conn & DIR.E) !== 0;
            const hasS = (conn & DIR.S) !== 0;
            const hasW = (conn & DIR.W) !== 0;

            const straightNS = degree === 2 && hasN && hasS;
            const straightEW = degree === 2 && hasE && hasW;

            let isNode = true;

            if (degree === 2 && (straightNS || straightEW)) {
                isNode = false;
                if (straightNS) {
                    if (hasN && y + 1 < h) {
                        const nIdx = idx + w;
                        if (isRoad[nIdx] && Math.abs(widthNS[nIdx] - widthNS[idx]) > eps) isNode = true;
                    }
                    if (hasS && y - 1 >= 0) {
                        const sIdx = idx - w;
                        if (isRoad[sIdx] && Math.abs(widthNS[sIdx] - widthNS[idx]) > eps) isNode = true;
                    }
                }
                if (straightEW) {
                    if (hasE && x + 1 < w) {
                        const eIdx = idx + 1;
                        if (isRoad[eIdx] && Math.abs(widthEW[eIdx] - widthEW[idx]) > eps) isNode = true;
                    }
                    if (hasW && x - 1 >= 0) {
                        const wIdx = idx - 1;
                        if (isRoad[wIdx] && Math.abs(widthEW[wIdx] - widthEW[idx]) > eps) isNode = true;
                    }
                }
            }

            if (degree <= 1) isNode = true;

            if (!isNode) continue;

            const pos = map.tileToWorldCenter(x, y);
            const node = {
                id: nodes.length,
                idx,
                tx: x,
                ty: y,
                x: pos.x,
                z: pos.z,
                connMask: conn,
                degree,
                edges: {},
                widths: {
                    N: hasN ? widthNS[idx] : 0,
                    E: hasE ? widthEW[idx] : 0,
                    S: hasS ? widthNS[idx] : 0,
                    W: hasW ? widthEW[idx] : 0
                }
            };

            nodeAt[idx] = node.id;
            nodes.push(node);
        }
    }

    const edges = [];
    const visited = new Set();

    for (const node of nodes) {
        for (const dir of DIRS) {
            if ((node.connMask & dir.bit) === 0) continue;
            const visitKey = `${node.id}:${dir.key}`;
            if (visited.has(visitKey)) continue;

            let x = node.tx;
            let y = node.ty;
            let steps = 0;
            let firstIdx = -1;
            let endNodeId = -1;

            while (true) {
                x += dir.dx;
                y += dir.dy;
                if (x < 0 || y < 0 || x >= w || y >= h) break;
                const idx = map.index(x, y);
                if (!isRoad[idx]) break;
                if (firstIdx < 0) firstIdx = idx;
                steps += 1;
                const nId = nodeAt[idx];
                if (nId >= 0) {
                    endNodeId = nId;
                    break;
                }
            }

            if (endNodeId < 0 || steps <= 0 || firstIdx < 0) continue;

            const edgeId = edges.length;
            const length = steps * ts;
            const width = dir.axis === 'NS' ? widthNS[firstIdx] : widthEW[firstIdx];
            const lanes = map.getLanesAtIndex(firstIdx);
            const lanesF = dir.axis === 'NS' ? (lanes.n ?? 0) : (lanes.e ?? 0);
            const lanesB = dir.axis === 'NS' ? (lanes.s ?? 0) : (lanes.w ?? 0);

            const edge = {
                id: edgeId,
                axis: dir.axis,
                start: node.id,
                end: endNodeId,
                length,
                width,
                lanesF,
                lanesB
            };

            edges.push(edge);
            node.edges[dir.key] = edgeId;
            nodes[endNodeId].edges[dir.opp] = edgeId;

            visited.add(visitKey);
            visited.add(`${endNodeId}:${dir.opp}`);
        }
    }

    return { nodes, edges };
}
