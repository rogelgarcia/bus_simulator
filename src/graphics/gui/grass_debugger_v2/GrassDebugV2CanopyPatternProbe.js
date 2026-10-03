// Low-resolution periodic material probe for source-layout feedback, not the final texture bake.
// @ts-check

/** @param {import('three').Mesh} mesh @param {number[]} shootIds @param {number} period */
export function createGrassDebugV2CanopyPatternProbe(mesh, shootIds, period) {
    const { position, normal, color } = mesh.geometry.attributes, index = mesh.geometry.index;
    const ranges = mesh.userData.grassLeafRanges;
    if (!position || !normal || !color || !index || !ranges?.length || ranges.length !== shootIds.length || !(period > 0))
        throw new Error('Pattern probe requires colored, indexed leaves and their shoot ids.');
    const lookup = new Map(), groups = [];
    for (const [leaf, range] of ranges.entries()) {
        const id = shootIds[leaf];
        if (!lookup.has(id)) { lookup.set(id, groups.length); groups.push({ id, vertices: new Set(), triangles: [], x: 0, z: 0, dx: 0, dz: 0 }); }
        const group = groups[lookup.get(id)];
        for (let i = range.start; i < range.start + range.count; i += 3) {
            const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            const points = vertices.map(v => [position.getX(v), position.getY(v), position.getZ(v)]);
            let nx = 0, ny = 0, nz = 0, luminance = 0;
            for (const v of vertices) {
                group.vertices.add(v); nx += normal.getX(v); ny += normal.getY(v); nz += normal.getZ(v);
                luminance += .2126 * color.getX(v) + .7152 * color.getY(v) + .0722 * color.getZ(v);
            }
            const scale = (ny < 0 ? -1 : 1) / Math.hypot(nx, ny, nz);
            group.triangles.push({ points, values: [1, nx * scale, ny * scale, nz * scale, luminance / 3] });
        }
    }
    for (const group of groups) {
        for (const v of group.vertices) { group.x += position.getX(v); group.z += position.getZ(v); }
        group.x /= group.vertices.size; group.z /= group.vertices.size;
    }
    const size = 128, count = size * size, mask = size - 1;
    const channels = Array.from({ length: 5 }, () => new Float32Array(count));
    const height = new Float32Array(count), owners = new Int32Array(count);
    function render() {
        channels.forEach(channel => channel.fill(0)); channels[2].fill(1); height.fill(-Infinity); owners.fill(-1);
        for (const [id, group] of groups.entries()) for (const triangle of group.triangles) {
            const p = triangle.points.map(v => [(v[0] + group.dx) / period * size + size / 2, v[1], (v[2] + group.dz) / period * size + size / 2]);
            const [a, b, c] = p;
            const determinant = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
            if (Math.abs(determinant) < 1e-8) continue;
            const minX = Math.ceil(Math.min(a[0], b[0], c[0]) - .5), maxX = Math.floor(Math.max(a[0], b[0], c[0]) - .5);
            const minZ = Math.ceil(Math.min(a[2], b[2], c[2]) - .5), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) - .5);
            for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
                const u = ((b[2] - c[2]) * (x + .5 - c[0]) + (c[0] - b[0]) * (z + .5 - c[2])) / determinant;
                const v = ((c[2] - a[2]) * (x + .5 - c[0]) + (a[0] - c[0]) * (z + .5 - c[2])) / determinant;
                if (u < 0 || v < 0 || u + v > 1) continue;
                const y = u * a[1] + v * b[1] + (1 - u - v) * c[1], pixel = (z & mask) * size + (x & mask);
                if (y <= height[pixel]) continue;
                height[pixel] = y; owners[pixel] = id;
                for (let channel = 0; channel < channels.length; channel++) channels[channel][pixel] = triangle.values[channel];
            }
        }
        return { channels, owners, size };
    }
    return Object.freeze({ groups, render, apply() {
        for (const group of groups) for (const v of group.vertices)
            position.setXYZ(v, position.getX(v) + group.dx, position.getY(v), position.getZ(v) + group.dz);
        position.needsUpdate = true; mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
    } });
}

function blur(input, output, scratch, size, rx, ry) {
    const mask = size - 1, width = rx * 2 + 1, height = ry * 2 + 1;
    for (let y = 0; y < size; y++) {
        const row = y * size; let sum = 0;
        for (let x = -rx; x <= rx; x++) sum += input[row + (x & mask)];
        for (let x = 0; x < size; x++) {
            scratch[row + x] = sum / width;
            sum += input[row + ((x + rx + 1) & mask)] - input[row + ((x - rx) & mask)];
        }
    }
    for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let y = -ry; y <= ry; y++) sum += scratch[(y & mask) * size + x];
        for (let y = 0; y < size; y++) {
            output[y * size + x] = sum / height;
            sum += scratch[((y + ry + 1) & mask) * size + x] - scratch[((y - ry) & mask) * size + x];
        }
    }
}

/** @param {number} size @param {number[]} sun */
export function createGrassDebugV2CanopyPatternScore(size, sun) {
    const count = size * size, scratch = new Float32Array(count), filtered = Array.from({ length: 5 }, () => new Float32Array(count));
    const normals = Array.from({ length: 3 }, () => new Float32Array(count));
    const leafLight = Array.from({ length: 3 }, () => new Float32Array(count)), values = new Float32Array(count);
    const projections = Array.from({ length: 2 }, () => new Float32Array(count));
    const kernels = [[2, 2], [4, 4], [8, 8], [2, 12], [12, 2]];
    const views = [15, 45].flatMap(e => [0, 90, 180, 270].map(a => {
        const el = e * Math.PI / 180, az = a * Math.PI / 180;
        return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    }));
    return Object.freeze({ evaluate(probe, attribution = false) {
        const heat = attribution ? new Float32Array(count) : null;
        let loss = 0, coverage = probe.channels[0].reduce((a, b) => a + b, 0) / count;
        for (const [rx, ry] of kernels) {
            for (let c = 0; c < 5; c++) blur(probe.channels[c], filtered[c], scratch, size, rx, ry);
            for (let i = 0; i < count; i += 2) {
                const m = filtered[0][i], scale = 1 / Math.max(.001, Math.hypot(filtered[1][i], filtered[2][i], filtered[3][i]));
                const nx = filtered[1][i] * scale, ny = filtered[2][i] * scale, nz = filtered[3][i] * scale;
                normals[0][i] = nx; normals[1][i] = ny; normals[2][i] = nz;
                const cosine = nx * sun[0] + ny * sun[1] + nz * sun[2];
                leafLight[0][i] = .72 * Math.max(0, cosine) + .55 * Math.max(0, -cosine);
                leafLight[1][i] = .72 * Math.max(0, -cosine) + .55 * Math.max(0, cosine);
                leafLight[2][i] = filtered[4][i] / Math.max(m, .001);
                for (let elevation = 0; elevation < 2; elevation++) projections[elevation][i] = 1 - Math.pow(1 - m, .884 / views[elevation * 4][1]);
            }
            for (const [viewId, view] of views.entries()) {
                let sum = 0, sum2 = 0;
                for (let i = 0; i < count; i += 2) {
                    const facing = Math.max(0, Math.min(1, (normals[0][i] * view[0] + normals[1][i] * view[1] + normals[2][i] * view[2] + .1) / .2));
                    const front = leafLight[0][i], back = leafLight[1][i], projected = projections[Math.floor(viewId / 4)][i], leaf = leafLight[2][i];
                    // Relight filtered source normals from eight views; keep ground out of leaf-color statistics.
                    const value = projected * leaf * (.3 + back + (front - back) * facing) + (1 - projected) * .12;
                    values[i] = value; sum += value; sum2 += value * value;
                }
                const samples = count / 2, mean = sum / samples, variance = Math.max(0, sum2 / samples - mean * mean) / (mean * mean);
                loss += variance;
                if (heat) for (let i = 0; i < count; i += 2) heat[i] += (values[i] / mean - 1) ** 2;
            }
            const mean = filtered[0].reduce((a, b) => a + b, 0) / count;
            loss += filtered[0].reduce((sum, m) => sum + (m - mean) ** 2, 0) / count;
        }
        return { loss: loss / (kernels.length * views.length), coverage, heat };
    } });
}
