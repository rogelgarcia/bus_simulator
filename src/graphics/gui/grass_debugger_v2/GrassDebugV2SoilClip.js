// Trim indexed leaf sheets to the soil height while retaining their surface attributes.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Mesh} mesh @param {(x:number,z:number)=>number} heightAt */
export function clipGrassDebugV2MeshAtSoil(mesh, heightAt) {
    const source = mesh.geometry, attributes = Object.entries(source.attributes);
    const position = source.attributes.position;
    mesh.updateMatrixWorld(true);
    const world = Array.from({ length: position.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
    const clearance = world.map(point => point.y - heightAt(point.x, point.z));
    const output = Object.fromEntries(attributes.map(([name]) => [name, []]));
    const vertices = new Map(), crossings = new Map(), indices = [];
    const append = (key, a, b = a, t = 0) => {
        if (vertices.has(key)) return vertices.get(key);
        const index = output.position.length / 3;
        for (const [name, attribute] of attributes) {
            const values = Array.from({ length: attribute.itemSize }, (_, component) =>
                THREE.MathUtils.lerp(attribute.array[a * attribute.itemSize + component],
                    attribute.array[b * attribute.itemSize + component], t));
            if (name === 'normal' || name === 'grassFacingNormal') {
                const length = Math.hypot(...values);
                for (let i = 0; i < values.length; i++) values[i] /= length;
            }
            output[name].push(...values);
        }
        vertices.set(key, index);
        return index;
    };
    const intersect = (a, b) => {
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (crossings.has(key)) return crossings.get(key);
        let low = 0, high = 1;
        const aInside = clearance[a] >= 0, point = new THREE.Vector3();
        for (let i = 0; i < 32; i++) {
            const t = (low + high) / 2;
            point.copy(world[a]).lerp(world[b], t);
            if ((point.y >= heightAt(point.x, point.z)) === aInside) low = t;
            else high = t;
        }
        const index = append(key, a, b, aInside ? low : high);
        crossings.set(key, index);
        return index;
    };
    for (let i = 0; i < source.index.count; i += 3) {
        const face = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)], polygon = [];
        for (let edge = 0; edge < 3; edge++) {
            const a = face[edge], b = face[(edge + 1) % 3];
            if (clearance[a] >= 0) polygon.push(append(a, a));
            if ((clearance[a] >= 0) !== (clearance[b] >= 0)) polygon.push(intersect(a, b));
        }
        for (let triangle = 1; triangle + 1 < polygon.length; triangle++)
            indices.push(polygon[0], polygon[triangle], polygon[triangle + 1]);
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of attributes)
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[name], attribute.itemSize));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.name = source.name;
    source.dispose(); mesh.geometry = geometry;
}
