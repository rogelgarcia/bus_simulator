// src/graphics/visuals/shared/ConnectorPathLine.js
// Creates a Line2 path artifact for connector debug visuals.
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createConnectorPathLine({
    y = 0,
    color = 0x3b82f6,
    lineWidth = 6,
    opacity = 1,
    renderOrder = 7,
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
    line.renderOrder = renderOrder;
    return { line, geo, mat };
}
