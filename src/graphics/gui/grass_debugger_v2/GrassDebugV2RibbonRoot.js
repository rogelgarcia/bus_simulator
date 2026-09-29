// Fit ribbon root corners along their existing edges without subdividing the body.
// @ts-check
import * as THREE from 'three';

/** @param {THREE.Mesh} mesh @param {(x:number,z:number)=>number} heightAt */
export function fitGrassDebugV2RibbonRoot(mesh, heightAt) {
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry, position = geometry.attributes.position;
    const start = new THREE.Vector3(), end = new THREE.Vector3(), point = new THREE.Vector3();
    for (let root = 0; root < 4; root++) {
        const next = root + 4;
        start.fromBufferAttribute(position, root).applyMatrix4(mesh.matrixWorld);
        end.fromBufferAttribute(position, next).applyMatrix4(mesh.matrixWorld);
        const clearance = t => {
            point.copy(start).lerp(end, t);
            return point.y - heightAt(point.x, point.z);
        };
        let low = -1, high = 1;
        if (!(clearance(low) <= 0 && clearance(high) > 0))
            throw new Error('Ribbon root edge must cross the soil below its first body section.');
        for (let step = 0; step < 32; step++) {
            const t = (low + high) / 2;
            if (clearance(t) >= 0) high = t;
            else low = t;
        }
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            const values = Array.from({ length: attribute.itemSize }, (_, axis) =>
                THREE.MathUtils.lerp(attribute.array[root * attribute.itemSize + axis],
                    attribute.array[next * attribute.itemSize + axis], high));
            const length = name === 'normal' || name === 'grassFacingNormal' ? Math.hypot(...values) : 1;
            for (let axis = 0; axis < values.length; axis++)
                attribute.array[root * attribute.itemSize + axis] = values[axis] / length;
            attribute.needsUpdate = true;
        }
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}
