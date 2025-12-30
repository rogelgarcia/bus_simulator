// graphics/visuals/shared/ConnectorTurnCircleLines.js
// Creates Line2 circle artifacts for connector turn visualization.
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export function createConnectorTurnCircleLines({
    y = 0,
    lineWidth = 2,
    opacity = 0.55,
    renderOrder = 2,
    depthTest = false,
    depthWrite = false,
    colors = [0x15803d, 0x15803d, 0x8b5cf6, 0x8b5cf6]
} = {}) {
    const lines = [];
    const count = colors.length;
    for (let i = 0; i < count; i++) {
        const baseColor = colors[i];
        const geo = new LineGeometry();
        geo.setPositions([0, y, 0, 0, y, 0]);
        const mat = new LineMaterial({
            color: baseColor,
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
        lines.push({ line, geo, mat, baseColor });
    }
    return lines;
}
