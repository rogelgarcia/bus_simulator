// Camera-aligned rows cover the interior with two card widths; unmatched roots retain their LOD2 leaf.
// @ts-check
export const GRASS_BILLBOARD_LAYOUT = Object.freeze({ widthMeters: .3, smallWidthMeters: .15, depthMeters: .05, textureVariants: 10 });

/** @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds @param {number} depth @param {number} sine @param {number} cosine */
function intervalAtDepth(bounds, depth, sine, cosine) {
    let left = -Infinity, right = Infinity;
    for (const [a, b, min, max] of [[cosine, sine * depth, bounds.minX, bounds.maxX], [-sine, cosine * depth, bounds.minZ, bounds.maxZ]]) {
        if (Math.abs(a) < 1e-10) {
            if (b < min - 1e-8 || b > max + 1e-8) return null;
        } else {
            const x = (min - b) / a, y = (max - b) / a;
            left = Math.max(left, Math.min(x, y)); right = Math.min(right, Math.max(x, y));
        }
    }
    return right > left ? [left, right] : null;
}

/**
 * @param {{bounds:{minX:number,maxX:number,minZ:number,maxZ:number}, roots:readonly {x:number,z:number}[], yaw:number, inset?:number, depthOrigin?:number}} options
 */
export function createGrassDebugV2BillboardLayout({ bounds, roots, yaw, inset = .15, depthOrigin = 0 }) {
    const inner = { minX: bounds.minX + inset, maxX: bounds.maxX - inset, minZ: bounds.minZ + inset, maxZ: bounds.maxZ - inset };
    if (![...Object.values(bounds), yaw, inset, depthOrigin].every(Number.isFinite) || inset < 0 || inner.minX >= inner.maxX || inner.minZ >= inner.maxZ)
        throw new Error('Billboard field bounds and inset must define a nonempty finite rectangle.');
    const sine = Math.sin(yaw), cosine = Math.cos(yaw), { widthMeters: width, smallWidthMeters: small, depthMeters: depth } = GRASS_BILLBOARD_LAYOUT;
    const corners = [[inner.minX, inner.minZ], [inner.maxX, inner.minZ], [inner.minX, inner.maxZ], [inner.maxX, inner.maxZ]];
    const depths = corners.map(([x, z]) => sine * x + cosine * z);
    const low = Math.floor((Math.min(...depths) - depthOrigin) / depth), high = Math.ceil((Math.max(...depths) - depthOrigin) / depth);
    const rows = new Map(), cells = [];
    for (let band = low; band <= high; band++) {
        const front = depthOrigin + band * depth, a = intervalAtDepth(inner, front, sine, cosine), b = intervalAtDepth(inner, front - depth, sine, cosine);
        if (!a || !b) continue;
        const left = Math.max(a[0], b[0]), right = Math.min(a[1], b[1]);
        if (right - left < small - 1e-8) continue;
        const mainLeft = Math.ceil((left - 1e-8) / width) * width;
        const mainCount = Math.max(0, Math.floor((right - mainLeft + 1e-8) / width));
        const row = { front, left, right, cells: [] };
        const add = (u, w) => {
            const cell = { id: cells.length, left: u, front, width: w, leafIds: [], small: w < width };
            cells.push(cell); row.cells.push(cell);
        };
        if (!mainCount) add((left + right - small) / 2, small);
        else {
            if (mainLeft - left >= small - 1e-8) add(mainLeft - small, small);
            for (let i = 0; i < mainCount; i++) add(mainLeft + i * width, width);
            const mainRight = mainLeft + mainCount * width;
            if (right - mainRight >= small - 1e-8) add(mainRight, small);
        }
        rows.set(band, row);
    }
    const assignments = new Int32Array(roots.length).fill(-1), fallback = [];
    for (let id = 0; id < roots.length; id++) {
        const root = roots[id], u = cosine * root.x - sine * root.z, d = sine * root.x + cosine * root.z;
        const row = rows.get(Math.ceil((d - depthOrigin) / depth - 1e-7));
        let cell = null;
        if (row && root.x >= inner.minX && root.x <= inner.maxX && root.z >= inner.minZ && root.z <= inner.maxZ) {
            let lo = 0, hi = row.cells.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1, candidate = row.cells[mid];
                if (u < candidate.left) hi = mid - 1;
                else if (u >= candidate.left + candidate.width) lo = mid + 1;
                else { cell = candidate; break; }
            }
        }
        if (cell) { cell.leafIds.push(id); assignments[id] = cell.id; }
        else fallback.push(id);
    }
    const plates = [];
    for (const cell of cells) {
        if (cell.leafIds.length < 2) {
            for (const id of cell.leafIds) { assignments[id] = -1; fallback.push(id); }
        } else {
            const id = plates.length;
            for (const leaf of cell.leafIds) assignments[leaf] = id;
            plates.push({ ...cell, id });
        }
    }
    return Object.freeze({ plates, fallback, assignments, depthOrigin, yaw, sine, cosine, inner });
}
