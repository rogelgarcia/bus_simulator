// src/graphics/assets3d/generators/road/render/RoadMarkingUtils.js
import { DASH_END_EPS, EPS, HALF } from '../RoadConstants.js';

export function addCurbSegment(curb, p0, p1, curbY, curbH, curbT, colorHex) {
    if (!curb || !p0 || !p1) return;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (!(len > EPS)) return;
    const midX = (p0.x + p1.x) * HALF;
    const midZ = (p0.y + p1.y) * HALF;
    const dirX = dx / len;
    const dirY = dy / len;
    const ry = Math.atan2(-dirY, dirX);
    curb.addBox(midX, curbY, midZ, len, curbH, curbT, ry, colorHex);
}

export function addSolidMark(markings, kind, data, lineW, heading, markY) {
    if (!markings || !data) return;
    if (kind === 'yellow') {
        markings.addYellow(data.mid.x, markY, data.mid.y, data.length, lineW, heading);
    } else {
        markings.addWhite(data.mid.x, markY, data.mid.y, data.length, lineW, heading);
    }
}

export function addDashedMark(markings, kind, data, dir, lineW, heading, markY, dashLen, dashGap) {
    if (!markings || !data) return;
    const step = dashLen + dashGap;
    const start = -data.length * HALF + dashLen * HALF;
    const end = data.length * HALF - dashLen * HALF + DASH_END_EPS;
    for (let t = start; t <= end; t += step) {
        const cx = data.mid.x + dir.x * t;
        const cz = data.mid.y + dir.y * t;
        if (kind === 'yellow') {
            markings.addYellow(cx, markY, cz, dashLen, lineW, heading);
        } else {
            markings.addWhite(cx, markY, cz, dashLen, lineW, heading);
        }
    }
}
