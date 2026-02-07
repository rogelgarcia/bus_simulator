// src/app/physics/interpolation/FixedTimestepPoseBuffer.js
// Fixed-timestep pose history buffer for render-time interpolation.
// @ts-check

function clamp01(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(1, num));
}

function normalizeAngleRad(rad) {
    let a = Number(rad);
    if (!Number.isFinite(a)) return 0;
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
}

function lerpAngleRad(a, b, t) {
    const aa = Number(a);
    const bb = Number(b);
    if (!Number.isFinite(aa) || !Number.isFinite(bb)) return 0;
    const delta = normalizeAngleRad(bb - aa);
    return aa + delta * t;
}

function writePose(dst, src) {
    dst.position.x = src.position.x;
    dst.position.y = src.position.y;
    dst.position.z = src.position.z;
    dst.yaw = src.yaw;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpPose(out, prev, curr, t) {
    out.position.x = lerp(prev.position.x, curr.position.x, t);
    out.position.y = lerp(prev.position.y, curr.position.y, t);
    out.position.z = lerp(prev.position.z, curr.position.z, t);
    out.yaw = lerpAngleRad(prev.yaw, curr.yaw, t);
    return out;
}

function createPose({ position, yaw } = {}) {
    return {
        position: {
            x: Number(position?.x ?? 0),
            y: Number(position?.y ?? 0),
            z: Number(position?.z ?? 0)
        },
        yaw: Number(yaw ?? 0)
    };
}

export class FixedTimestepPoseBuffer {
    constructor(initialPose = null) {
        const init = initialPose && typeof initialPose === 'object' ? initialPose : null;
        this.prev = createPose(init ?? undefined);
        this.curr = createPose(init ?? undefined);
    }

    reset(pose) {
        const p = pose && typeof pose === 'object' ? pose : null;
        if (!p) return;
        writePose(this.prev, p);
        writePose(this.curr, p);
    }

    push(pose) {
        const p = pose && typeof pose === 'object' ? pose : null;
        if (!p) return;
        writePose(this.prev, this.curr);
        writePose(this.curr, p);
    }

    interpolate(alpha, out) {
        const t = clamp01(alpha);
        if (!out || typeof out !== 'object' || !out.position || typeof out.position !== 'object') {
            throw new Error('[FixedTimestepPoseBuffer] interpolate(out): out.position is required');
        }
        return lerpPose(out, this.prev, this.curr, t);
    }
}

