// src/graphics/visuals/city/HoverOutlineLine.js
// Creates the hover outline line used to highlight meshes in city view.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createHoverOutlineLine({
    renderer,
    color = 0xff0000,
    lineWidth = 4,
    opacity = 0.9,
    renderOrder = 12,
    depthTest = false,
    depthWrite = false
} = {}) {
    const material = new LineMaterial({
        color,
        linewidth: lineWidth,
        worldUnits: false,
        transparent: true,
        opacity,
        depthTest,
        depthWrite
    });
    if (renderer) {
        const size = renderer.getSize(new THREE.Vector2());
        material.resolution.set(size.x, size.y);
    }
    const line = new LineSegments2(new LineSegmentsGeometry(), material);
    line.visible = false;
    line.renderOrder = renderOrder;
    line.frustumCulled = false;
    return { line, material };
}
