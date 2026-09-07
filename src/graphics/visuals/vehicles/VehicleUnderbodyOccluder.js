// Fits the dominant opaque downward-facing bus floor, including wheel-well cutouts.
import * as THREE from 'three';

export function findVehicleUnderbodyOccluder(root, diagnostics = null) {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert(), planes = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3();
    root.traverseVisible(mesh => {
        if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.userData.excludeFromAmbientOcclusion) return;
        const geometry = mesh.geometry, positions = geometry?.attributes.position;
        if (!positions) return;
        const transform = inverse.clone().multiply(mesh.matrixWorld);
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? positions.count, materialIndex: 0 }];
        for (const group of groups) {
            const material = materials[group.materialIndex];
            if (!material || material.visible === false || material.transparent || material.alphaTest > 0) continue;
            for (let i = group.start; i < group.start + group.count; i += 3) {
                [a, b, c].forEach((v, j) => v.fromBufferAttribute(positions, geometry.index ? geometry.index.getX(i+j) : i+j).applyMatrix4(transform));
                const normal = ab.subVectors(b,a).cross(ac.subVectors(c,a));
                if (normal.y >= 0 || Math.hypot(normal.x, normal.z) > -normal.y * .001) continue;
                const height = (a.y+b.y+c.y)/3, key = Math.round(height * 10000);
                let plane = planes.get(key);
                if (!plane) { plane = { height, area: 0, bounds: new THREE.Box3() }; planes.set(key, plane); }
                plane.area += -normal.y * .5;
                plane.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
            }
        }
    });
    const candidates = [...planes.values()].filter(p => {
        const size = p.bounds.getSize(new THREE.Vector3()), rectangleArea = size.x * size.z;
        return rectangleArea > 0 && p.area / rectangleArea >= .85 && p.area / rectangleArea <= 1.02;
    });
    if (diagnostics) diagnostics.planes = [...planes.values()].map(p => ({ height:p.height, area:p.area,
        min:p.bounds.min.toArray(), max:p.bounds.max.toArray(), rectangle:candidates.includes(p) }));
    if (!candidates.length) return null;
    // Bus-only rectangle approximation: reject sparse planes, then prefer the lowest dominant floor.
    const largest = Math.max(...candidates.map(p => p.area));
    const plane = candidates.filter(p => p.area >= largest * .95).sort((a,b) => a.height-b.height)[0];
    return Object.freeze({ min: Object.freeze([plane.bounds.min.x, plane.height, plane.bounds.min.z]),
        max: Object.freeze([plane.bounds.max.x, plane.height, plane.bounds.max.z]) });
}
