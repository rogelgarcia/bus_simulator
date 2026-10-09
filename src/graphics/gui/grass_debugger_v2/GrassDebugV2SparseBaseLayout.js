// Choose whole shoots by their joint, periodic top-down coverage in both base tiles.
export function selectGrassSparseBaseShoots(sources, density, periodMeters) {
    if (sources.length !== 2 || !(density > 0 && density < 1) || !(periodMeters > 0)
        || sources.some(source => !source.geometry?.index || !source.userData.grassLeafRanges?.length)
        || sources[0].userData.grassLeafRanges.length !== sources[1].userData.grassLeafRanges.length)
        throw new Error('Sparse base selection requires two matching indexed tiles and a partial density.');
    const size = 128, area = size * size, count = Math.ceil(sources[0].userData.grassLeafRanges.length / 2);
    const footprints = Array.from({ length: count }, () => new Set());
    const wrap = value => ((value % size) + size) % size;
    sources.forEach((source, variant) => {
        const p = source.geometry.attributes.position, index = source.geometry.index;
        source.userData.grassLeafRanges.forEach(({ start, count: length }, leaf) => {
            const footprint = footprints[Math.floor(leaf / 2)];
            for (let i = start; i < start + length; i += 3) {
                const points = [0, 1, 2].map(k => {
                    const v = index.getX(i + k);
                    return [(p.getX(v) / periodMeters + .5) * size, (p.getZ(v) / periodMeters + .5) * size];
                });
                const [a, b, c] = points;
                const cross = (u, v, x, z) => (v[0] - u[0]) * (z - u[1]) - (v[1] - u[1]) * (x - u[0]);
                const sign = Math.sign(cross(a, b, c[0], c[1]));
                if (!sign) continue;
                for (let z = Math.floor(Math.min(...points.map(v => v[1]))); z <= Math.max(...points.map(v => v[1])); z++)
                    for (let x = Math.floor(Math.min(...points.map(v => v[0]))); x <= Math.max(...points.map(v => v[0])); x++) {
                        if ([cross(a, b, x + .5, z + .5), cross(b, c, x + .5, z + .5), cross(c, a, x + .5, z + .5)].some(v => v * sign < 0)) continue;
                        footprint.add(variant * area + wrap(z) * size + wrap(x));
                    }
            }
        });
    });
    // A soft occupancy score rewards empty regions, including small gaps beside
    // existing leaves. Both variants select the same IDs, preserving their seams.
    const weights = new Float32Array(area * 2).fill(1), selected = new Set();
    const target = Math.round(count * density);
    for (let pick = 0; pick < target; pick++) {
        let best = -1, score = -1;
        for (let shoot = 0; shoot < count; shoot++) {
            if (selected.has(shoot)) continue;
            let gain = 0;
            for (const pixel of footprints[shoot]) gain += weights[pixel];
            if (gain > score) { score = gain; best = shoot; }
        }
        selected.add(best);
        for (const pixel of footprints[best]) {
            const variant = Math.floor(pixel / area), local = pixel % area, x = local % size, z = Math.floor(local / size);
            weights[pixel] *= .1;
            for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
                weights[variant * area + wrap(z + dz) * size + wrap(x + dx)] *= .8;
        }
    }
    return selected;
}
