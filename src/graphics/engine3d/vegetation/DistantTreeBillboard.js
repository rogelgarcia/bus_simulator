// Selects a normal-mapped impostor view and updates one physical quad in the asset's local frame.
// @ts-check
import * as THREE from 'three';

const toYUp = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const angularDistance = (a, b) => Math.abs(((a-b+540)%360)-180);

/** @param {Array<any>} views @param {number} azimuth @param {number} elevation */
export function selectDistantView(views, azimuth, elevation) {
    if (!views.length || !Number.isFinite(azimuth) || !Number.isFinite(elevation)) throw new Error('Invalid billboard view query');
    return views.reduce((best, view) => {
        const score = angularDistance(view.azimuthDegrees, azimuth) ** 2 + (view.elevationDegrees-elevation) ** 2;
        return score < best.score ? { view, score } : best;
    }, { view: views[0], score: Infinity }).view;
}

/** @param {THREE.Object3D} root @param {any} record */
export function createDistantBillboardUpdater(root, record) {
    if (![5, 6].includes(record.level) || record.views.length !== 16) throw new Error('Expected a directional distant billboard');
    let mesh;
    root.traverse(object => { if (object.isMesh && object.userData.surface === 'mixed') mesh = object; });
    if (!mesh || mesh.geometry.index?.count !== 6) throw new Error('Expected one two-triangle billboard mesh');
    const geometry = mesh.geometry, position = geometry.attributes.position, uv = geometry.attributes.uv;
    const normal = geometry.attributes.normal, tangent = geometry.attributes.tangent, first = record.views[0].uv;
    // glTF flips Blender's bottom-origin texture V coordinate during export.
    const corners = Array.from({ length: uv.count }, (_, i) => [uv.getX(i) > (first[0]+first[2])/2 ? 1 : -1, uv.getY(i) < 1-(first[1]+first[3])/2 ? 1 : -1]);
    const center = toYUp(record.bounds[0]).add(toYUp(record.bounds[1])).multiplyScalar(.5);
    const pivot = new THREE.Vector3(0, record.bounds[0][2], 0);
    const rootOffsets = new Map(record.views.map(view => {
        const offset = pivot.clone().sub(toYUp(view.center));
        return [view, [offset.dot(toYUp(view.basis.map(row => row[0]))), offset.dot(toYUp(view.basis.map(row => row[1])))]];
    }));
    const cameraLocal = new THREE.Vector3(), facing = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), point = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);
    return camera => {
        root.updateWorldMatrix(true, true); camera.getWorldPosition(cameraLocal); root.worldToLocal(cameraLocal);
        facing.copy(cameraLocal).sub(center).normalize();
        if (Math.abs(facing.y) > .999) facing.set(facing.x || .001, facing.y, facing.z).normalize();
        const azimuth = Math.atan2(-facing.z, facing.x)*180/Math.PI;
        const elevation = Math.asin(facing.y)*180/Math.PI;
        const view = selectDistantView(record.views, azimuth, elevation), anchor = toYUp(view.center);
        right.crossVectors(worldUp, facing).normalize(); up.crossVectors(facing, right).normalize();
        if (record.level === 5) {
            const [x, y] = rootOffsets.get(view);
            anchor.copy(pivot).addScaledVector(right, -x).addScaledVector(up, -y);
        }
        for (let i=0; i<position.count; i++) {
            const [x, y] = corners[i];
            point.copy(anchor).addScaledVector(right, x*view.size[0]/2).addScaledVector(up, y*view.size[1]/2);
            position.setXYZ(i, point.x, point.y, point.z); normal.setXYZ(i, facing.x, facing.y, facing.z);
            tangent.setXYZW(i, right.x, right.y, right.z, 1);
            uv.setXY(i, view.uv[x>0 ? 2 : 0], 1-view.uv[y>0 ? 3 : 1]);
        }
        for (const attribute of [position, normal, tangent, uv]) attribute.needsUpdate = true;
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        root.userData.distantView = { azimuthDegrees: view.azimuthDegrees, elevationDegrees: view.elevationDegrees };
    };
}
