// Describe the optional curved road and grass plot alongside the straight bus reference.
// Arc control segments must exceed the road engine's trim threshold; its fillets supply the smooth contour.
// @ts-check

/** @param {string} search */
export function readGrassCurveRadius(search) {
    const value = new URLSearchParams(search).get('curve');
    if (value === null || value === 'off') return null;
    const radius = Number(value);
    if (![18, 30].includes(radius)) throw new Error('Grass curve radius must be 18 or 30 metres.');
    return radius;
}

/** @param {18|30} radius */
export function createGrassCurveLayout(radius) {
    if (![18, 30].includes(radius)) throw new Error('Unsupported grass curve radius.');
    const center = { x: 105, z: 45 }, extent = radius + 16, plotRadius = radius + 14;
    const points = [{ x: center.x - radius, z: center.z - radius - 20 }];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
        const angle = Math.PI * (1 - i / segments);
        points.push({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
    }
    points.push({ x: center.x + radius, z: center.z - radius - 20 });
    const outline = Array.from({ length: 512 }, (_, i) => {
        const angle = i / 512 * Math.PI * 2;
        return { x: center.x + Math.cos(angle) * plotRadius, z: center.z + Math.sin(angle) * plotRadius };
    });
    return Object.freeze({ radius, center: Object.freeze(center), plotRadius,
        bounds: Object.freeze({ minX: center.x - extent, minZ: center.z - extent, maxX: center.x + extent, maxZ: center.z + extent }),
        outline: Object.freeze(outline), segment: Object.freeze({ id: 'grass-v2-curve', kind: 'polyline', tag: 'grass_v2_curve',
            lanesF: 1, lanesB: 1, rendered: true, points }) });
}
