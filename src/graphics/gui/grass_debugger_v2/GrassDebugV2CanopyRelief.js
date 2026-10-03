// Lift sparse visible leaf facets from the compiled canopy footprint without adding textures.
// @ts-check
import * as THREE from 'three';

export const GRASS_CANOPY_RELIEF = Object.freeze({ leavesPerSquareMeter: 48, minimumSpacing: .075,
    insetScale: .82, minimumWidth: .06, maximumWidth: .09, widthToLength: 1.5,
    maximumTipOffset: .7, maximumInclinationDegrees: 5, nearScale: .6, growStart: 2, growEnd: 12,
    flattenStart: 24, flattenEnd: 64 });

function randomShape(leaf, variant, col, row) {
    let seed = (Math.imul(leaf + 1, 1597334677) ^ Math.imul(variant + 1, 3812015801)
        ^ Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
    const random = () => {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let value = Math.imul(seed ^ seed >>> 15, seed | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const config = GRASS_CANOPY_RELIEF;
    return { width: THREE.MathUtils.lerp(config.minimumWidth, config.maximumWidth, random()),
        tipOffset: (random() * 2 - 1) * config.maximumTipOffset,
        rotation: random() * Math.PI * 2,
        inclinationDegrees: (random() * 2 - 1) * config.maximumInclinationDegrees };
}

function visibleFacets(source, bake, period) {
    const state = bake.getSnapshot(), size = state.mapResolutions.albedo;
    if (state.mapResolutions.normal !== size) throw new Error('Relief selection requires matching albedo/normal capture sizes.');
    const albedo = bake.readPixels('all', 'albedo'), normal = bake.readPixels('all', 'normal');
    const { position } = source.geometry.attributes, index = source.geometry.index, candidates = [];
    const pixel = (x, z) => {
        const u = .5 + x / period, v = .5 - z / period;
        return (Math.floor((v - Math.floor(v)) * size) * size + Math.floor((u - Math.floor(u)) * size)) * 4;
    };
    for (const [leaf, range] of source.userData.grassLeafRanges.entries()) {
        let best = null;
        for (let i = range.start; i < range.start + range.count; i += 3) {
            const points = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)));
            const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
            points.forEach(p => p.sub(center).multiplyScalar(GRASS_CANOPY_RELIEF.insetScale).add(center));
            const area = Math.abs((points[1].x - points[0].x) * (points[2].z - points[0].z)
                - (points[2].x - points[0].x) * (points[1].z - points[0].z)) / 2;
            const span = Math.max(...points.flatMap(a => points.map(b => Math.hypot(a.x - b.x, a.z - b.z))));
            if (area < .00008 || span < .045) continue;
            let visible = 0, samples = 0;
            for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3 - a; b++) {
                const weights = [(a + .25) / 3.75, (b + .25) / 3.75, (3 - a - b + .25) / 3.75];
                const p = points.reduce((sum, point, k) => sum.addScaledVector(point, weights[k]), new THREE.Vector3());
                const offset = pixel(p.x, p.z);
                if (normal[offset + 3] > 245 && Math.abs(albedo[offset + 3] / 255 * state.sourceHeight - p.y) < .004) visible++;
                samples++;
            }
            if (visible < samples * .8) continue;
            if (!best || area > best.area) best = { leaf, points, center, area, span, visibility: visible / samples };
        }
        if (best) candidates.push(best);
    }
    candidates.sort((a, b) => ((Math.imul(a.leaf + 1, 1597334677) >>> 0) - (Math.imul(b.leaf + 1, 1597334677) >>> 0)));
    const selected = [], target = Math.round(period * period * GRASS_CANOPY_RELIEF.leavesPerSquareMeter);
    const wrap = x => x - Math.floor(x / period + .5) * period;
    for (const candidate of candidates) {
        const x = wrap(candidate.center.x), z = wrap(candidate.center.z);
        if (selected.some(other => Math.hypot(wrap(other.center.x - x), wrap(other.center.z - z)) < GRASS_CANOPY_RELIEF.minimumSpacing)) continue;
        const dx = x - candidate.center.x, dz = z - candidate.center.z;
        candidate.points.forEach(p => { p.x += dx; p.z += dz; }); candidate.center.x = x; candidate.center.z = z;
        selected.push(candidate);
        if (selected.length === target) break;
    }
    if (!selected.length) throw new Error('No visible canopy leaves passed the LOD3 relief alignment check.');
    return { selected, candidates: candidates.length };
}

/** @param {{sources:THREE.Mesh[],bakes:object[],surface:THREE.Mesh,width:number,depth:number,period:number,inset:number,materials:object}} options */
export function createGrassDebugV2CanopyRelief({ sources, bakes, surface, width, depth, period, inset, materials }) {
    if (sources.length !== 2 || bakes.length !== 2 || !(width > period && depth > period)) throw new Error('Canopy relief requires two matching periodic source tiles.');
    const variants = sources.map((source, i) => visibleFacets(source, bakes[i], period));
    const sourceHeight = Math.min(...bakes.map(bake => bake.getSnapshot().sourceHeight));
    if (!(sourceHeight > surface.geometry.boundingBox.max.y + .0004)) throw new Error('Canopy relief needs height below the tallest source leaf.');
    const positions = [], uvs = [], rises = [], displacements = [], centers = [], assignments = [], ray = new THREE.Raycaster();
    ray.ray.direction.set(0, -1, 0); surface.updateMatrixWorld(true);
    const heightAt = (x, z) => {
        ray.ray.origin.set(x, 1, z);
        const hit = ray.intersectObject(surface, false)[0];
        if (!hit) throw new Error('Relief vertex is outside the canopy surface.');
        return hit.point.y + .0004;
    };
    const limitX = width / 2 - inset, limitZ = depth / 2 - inset;
    for (let row = -Math.ceil(depth / (2 * period)); row <= Math.ceil(depth / (2 * period)); row++)
        for (let col = -Math.ceil(width / (2 * period)); col <= Math.ceil(width / (2 * period)); col++) {
            const variant = ((col - row) % 2 + 2) % 2;
            for (const facet of variants[variant].selected) {
                const shape = randomShape(facet.leaf, variant, col, row), length = shape.width / GRASS_CANOPY_RELIEF.widthToLength;
                const tipX = shape.tipOffset * shape.width / 2, sin = Math.sin(shape.rotation), cos = Math.cos(shape.rotation);
                const center = [facet.center.x + col * period, 0, facet.center.z + row * period];
                if (Math.abs(center[0]) > limitX || Math.abs(center[2]) > limitZ) continue;
                center[1] = heightAt(center[0], center[2]);
                const footprint = [[-shape.width / 2, -length / 3], [shape.width / 2, -length / 3], [tipX, length * 2 / 3]];
                const points = footprint.map(([x, z]) => new THREE.Vector3(center[0] + (x - tipX / 3) * cos - z * sin,
                    0, center[2] + (x - tipX / 3) * sin + z * cos));
                const sourcePoints = facet.points.map(p => p.clone().add(new THREE.Vector3(col * period, 0, row * period))).sort((a, b) => a.y - b.y);
                if ([...points, ...sourcePoints].some(p => Math.abs(p.x) > limitX || Math.abs(p.z) > limitZ)) continue;
                const signedRise = length * Math.tan(THREE.MathUtils.degToRad(shape.inclinationDegrees));
                const offsets = signedRise >= 0 ? [0, 0, signedRise] : [-signedRise, -signedRise, 0];
                const heights = sourcePoints.map(p => heightAt(p.x, p.z));
                const baseHeight = Math.max(center[1], ...heights, ...points.map(p => heightAt(p.x, p.z)));
                const scale = Math.min(1, ...offsets.map(rise => rise > 0 ? (sourceHeight - baseHeight) / rise : 1));
                for (const [i, p] of points.entries()) {
                    const source = sourcePoints[i];
                    positions.push(source.x, heights[i], source.z); uvs.push(.5 + source.x / period, .5 - source.z / period);
                    displacements.push(p.x - source.x, p.z - source.z);
                    rises.push(baseHeight + offsets[i] * scale - heights[i]); centers.push(...center);
                }
                assignments.push({ variant, leaf: facet.leaf, col, row, visibility: facet.visibility, ...shape,
                    rise: Math.abs(signedRise) * scale, heightScale: scale });
            }
        }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('grassReliefRise', new THREE.Float32BufferAttribute(rises, 1));
    geometry.setAttribute('grassReliefOffset', new THREE.Float32BufferAttribute(displacements, 2));
    geometry.setAttribute('grassReliefCenter', new THREE.Float32BufferAttribute(centers, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: positions.length }, (_, i) => i % 3 === 1 ? 1 : 0), 3));
    geometry.computeBoundingBox();
    const maximumHeight = rises.reduce((highest, rise, i) => Math.max(highest, positions[i * 3 + 1] + rise), -Infinity);
    const boundPoint = new THREE.Vector3();
    for (let i = 0; i < rises.length; i++) geometry.boundingBox.expandByPoint(boundPoint.set(
        positions[i * 3] + displacements[i * 2], positions[i * 3 + 1] + rises[i], positions[i * 3 + 2] + displacements[i * 2 + 1]));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, materials.all), group = new THREE.Group();
    mesh.name = 'GrassField-LOD3-Relief'; mesh.userData.grassCanopyRelief = true;
    mesh.userData.grassLeafCount = 0; mesh.castShadow = false; mesh.receiveShadow = true;
    group.name = 'GrassField-LOD3'; group.add(mesh);
    return Object.freeze({ group, assignments: Object.freeze(assignments),
        getSnapshot: () => ({ strategy: 'canopy-relief', triangles: positions.length / 9, trianglesPerLeaf: 1,
            variants: variants.map(v => ({ selected: v.selected.length, visibleCandidates: v.candidates })),
            definition: GRASS_CANOPY_RELIEF, sourceHeight, maximumHeight, extraTextureBytes: 0,
            geometryBytes: Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0),
            minimumSourceVisibility: Math.min(...assignments.map(a => a.visibility)), shadowSource: 'LOD2', runtimeCaptures: false }),
        dispose() { geometry.dispose(); }
    });
}
