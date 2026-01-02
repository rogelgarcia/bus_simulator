// src/graphics/visuals/city/ConnectorCollisionArrow.js
// Creates a collision arrow artifact for connector hover debugging.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createConnectorCollisionArrow({
    y = 0,
    color = 0x000000,
    opacity = 0.5,
    lineWidth = 2,
    markerRadius = 0.35,
    headLength = null,
    headWidth = null,
    renderOrderLine = 14,
    renderOrderHead = 15,
    depthTest = false,
    depthWrite = false
} = {}) {
    const geo = new LineGeometry();
    geo.setPositions([0, y, 0, 0, y, 0]);
    const mat = new LineMaterial({
        color,
        linewidth: lineWidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest,
        depthWrite
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    line.visible = false;
    line.frustumCulled = false;
    line.renderOrder = renderOrderLine;

    const headLen = Number.isFinite(headLength) ? headLength : markerRadius * 0.85;
    const headW = Number.isFinite(headWidth) ? headWidth : markerRadius * 0.6;
    const headHalf = headW * 0.5;
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(
            new Float32Array([
                0, 0, 0,
                -headLen, 0, headHalf,
                -headLen, 0, -headHalf
            ]),
            3
        )
    );
    headGeo.setIndex([0, 1, 2]);
    headGeo.computeVertexNormals();
    headGeo.computeBoundingSphere();
    const headMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest,
        depthWrite
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.visible = false;
    head.renderOrder = renderOrderHead;

    return { line, geo, mat, head, headGeo, headMat };
}
