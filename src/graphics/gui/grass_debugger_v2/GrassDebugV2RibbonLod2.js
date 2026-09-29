// Two full-length leaf faces with a shallow diagonal fold and separate lighting normals.
// @ts-check
import * as THREE from 'three';
import { sampleGrassDebugV2Lod2Color } from './GrassDebugV2ShootAppearance.js?v=lod2-color-1';

export function createGrassDebugV2RibbonLod2Geometry(recipe, definition) {
    const stations = [[0, 0], [1, 0], [0, 1], [1, definition.shortEdgeStation]];
    const halfWidth = recipe.width * 0.5 * Math.sin(THREE.MathUtils.degToRad(recipe.openHalfAngleDegrees));
    const curvature = THREE.MathUtils.degToRad(recipe.backwardBendDegrees) / recipe.rise;
    const corners = stations.map(([u, v]) => {
        const length = recipe.rise * (1.02 * v - 0.02 * v * v * v), angle = curvature * length;
        return new THREE.Vector3(-halfWidth * (2 * u - 1) * (v ? definition.topWidthScale : 1),
            curvature ? Math.sin(angle) / curvature : length,
            curvature ? -(1 - Math.cos(angle)) / curvature : 0);
    });
    const plane = new THREE.Plane().setFromCoplanarPoints(corners[0], corners[2], corners[1]);
    plane.projectPoint(corners[3], corners[3]);
    const hinge = corners[2].clone().sub(corners[1]).normalize();
    corners[3].sub(corners[1]).applyAxisAngle(hinge, THREE.MathUtils.degToRad(definition.foldDegrees)).add(corners[1]);
    const positions = [], colors = [], uvs = [], color = new THREE.Color();
    for (const corner of [0, 2, 1, 1, 2, 3]) {
        const [u, v] = stations[corner];
        positions.push(...corners[corner].toArray());
        sampleGrassDebugV2Lod2Color(v, color);
        colors.push(color.r, color.g, color.b); uvs.push(u, 0.18 + 0.82 * v);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    geometry.computeVertexNormals();
    geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

// Fit both copies of each root corner while retaining the shared diagonal's hard shading.
export function fitGrassDebugV2RibbonLod2Root(mesh, heightAt) {
    mesh.updateWorldMatrix(true, false);
    const inverse = mesh.matrixWorld.clone().invert(), point = new THREE.Vector3();
    const geometry = mesh.geometry, { position, uv } = geometry.attributes;
    for (let i = 0; i < position.count; i++) if (uv.getY(i) < 0.181) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        point.y = heightAt(point.x, point.z);
        point.applyMatrix4(inverse); position.setXYZ(i, point.x, point.y, point.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.setAttribute('grassFacingNormal', geometry.attributes.normal.clone());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
}
