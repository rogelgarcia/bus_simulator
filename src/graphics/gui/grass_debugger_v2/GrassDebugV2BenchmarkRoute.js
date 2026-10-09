// Smooth flight through the bus camera, past the bus front, along the grass and back to the wide view.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2OverviewPose } from './GrassDebugV2CameraPresets.js';

export const BENCHMARK_BASE_FLIGHT_MS = 24_000;
export const BENCHMARK_WARMUP_MS = 2_000;
export const BENCHMARK_FINAL_HOLD_MS = 1_000;
export const BENCHMARK_LOOK_BACK_MS = 4_000;

export function easeBenchmarkProgress(t) {
    return t * t * t * (10 + t * (-15 + 6 * t));
}

class FlightLeg extends THREE.Curve {
    constructor(start, end, startDirection, endDirection) {
        super();
        this.start = start;
        this.end = end;
        const length = start.distanceTo(end);
        this.startVelocity = startDirection.clone().multiplyScalar(length);
        this.endVelocity = endDirection.clone().multiplyScalar(length);
        this.arcLengthDivisions = 512;
    }

    getPoint(t, target = new THREE.Vector3()) {
        const t3 = t * t * t;
        const t4 = t3 * t;
        const t5 = t4 * t;
        const blend = easeBenchmarkProgress(t);
        return target.copy(this.start).multiplyScalar(1 - blend)
            .addScaledVector(this.end, blend)
            .addScaledVector(this.startVelocity, t - 6 * t3 + 8 * t4 - 3 * t5)
            .addScaledVector(this.endVelocity, -4 * t3 + 7 * t4 - 3 * t5);
    }
}

/** @param {THREE.Vector3} busPosition
 * @param {{busFrontZ:number,grassBounds:{minX:number,maxX:number,minZ:number,maxZ:number}}} options */
export function createBenchmarkRoute(busPosition, { busFrontZ, grassBounds }) {
    const clearanceZ = busFrontZ + 10;
    const grassEntryZ = clearanceZ + 6;
    if (!Number.isFinite(busFrontZ) || !(grassBounds.minX < grassBounds.maxX && grassBounds.minZ < grassEntryZ && grassEntryZ + 5 < grassBounds.maxZ))
        throw new Error('Benchmark requires a grass run extending beyond the front of the bus.');
    const overview = createGrassDebugV2OverviewPose();
    const startDirection = overview.target.clone().sub(overview.position).normalize();
    const points = [
        overview.position,
        busPosition.clone(),
        new THREE.Vector3(busPosition.x, busPosition.y, clearanceZ),
        new THREE.Vector3((grassBounds.minX + grassBounds.maxX) / 2, 1.258, grassEntryZ),
        new THREE.Vector3((grassBounds.minX + grassBounds.maxX) / 2, 1.258, grassBounds.maxZ),
        new THREE.Vector3(14.39, 8.247, 48.256)
    ];
    const forward = new THREE.Vector3(0, 0, 1);
    const finishDirection = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(-23.461), 0, 0, 'YXZ'
    ));
    const route = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) {
        route.add(new FlightLeg(points[i], points[i + 1], i === 0 ? startDirection : forward, i === points.length - 2 ? finishDirection : forward));
    }
    route.updateArcLengths();
    return Object.assign(route, { flight: Object.freeze({ busFrontZ, clearanceZ, grassEntryZ, grassExitZ: grassBounds.maxZ,
        waypoints: points.map(point => point.toArray()) }) });
}

/** @param {THREE.CurvePath<THREE.Vector3>} route */
export function createBenchmarkFlightTiming(route) {
    const length = route.getLength();
    const lengths = route.getCurveLengths();
    const grassStart = lengths.at(-3);
    const grassEnd = lengths.at(-2);
    const baseDurationMs = BENCHMARK_BASE_FLIGHT_MS * length / (length - lengths[0]);
    const speedScale = distance => distance < grassStart
        ? 1 - 0.5 * easeBenchmarkProgress(THREE.MathUtils.clamp((distance - grassStart + 5) / 5, 0, 1))
        : 0.5 + 0.5 * easeBenchmarkProgress(THREE.MathUtils.clamp((distance - grassEnd) / 5, 0, 1));
    const steps = 4096;
    const times = new Float64Array(steps + 1);
    let previousScale = 1;
    for (let i = 1; i <= steps; i++) {
        const scale = speedScale(easeBenchmarkProgress(i / steps) * length);
        times[i] = times[i - 1] + baseDurationMs / steps * (1 / previousScale + 1 / scale) / 2;
        previousScale = scale;
    }
    return Object.freeze({
        durationMs: times[steps],
        baseDurationMs,
        timeAtDistance(fraction) {
            let low = 0, high = 1;
            for (let i = 0; i < 40; i++) {
                const mid = (low + high) / 2;
                if (easeBenchmarkProgress(mid) < fraction) low = mid; else high = mid;
            }
            const sample = (low + high) / 2 * steps, index = Math.min(steps - 1, Math.floor(sample));
            return THREE.MathUtils.lerp(times[index], times[index + 1], sample - index);
        },
        distanceAtTime(elapsedMs) {
            if (elapsedMs <= 0) return 0;
            if (elapsedMs >= times[steps]) return 1;
            let low = 0, high = steps;
            while (high - low > 1) {
                const mid = (low + high) >>> 1;
                if (times[mid] <= elapsedMs) low = mid;
                else high = mid;
            }
            const fraction = (elapsedMs - times[low]) / (times[high] - times[low]);
            return easeBenchmarkProgress((low + fraction) / steps);
        }
    });
}

/** Camera heading is independent of travel during the bus cruise and the four-second look-back.
 * @param {THREE.CurvePath<THREE.Vector3>} route @param {object} timing
 * @param {{position:THREE.Vector3,target:THREE.Vector3}} busPose @param {THREE.Vector3} busTarget */
export function createBenchmarkFlightOrientation(route, timing, busPose, busTarget) {
    const length = route.getLength(), lengths = route.getCurveLengths();
    const lookBackStartMs = timing.timeAtDistance(lengths.at(-2) / length);
    if (timing.durationMs - lookBackStartMs < BENCHMARK_LOOK_BACK_MS)
        throw new Error('The final benchmark leg must allow the complete four-second look-back.');
    const up = new THREE.Vector3(0, 1, 0), matrix = new THREE.Matrix4(), direction = new THREE.Vector3(), target = new THREE.Vector3();
    const busRotation = new THREE.Quaternion().setFromRotationMatrix(matrix.lookAt(busPose.position, busPose.target, up));
    const exit = route.getPoint(lengths.at(-2) / length);
    route.getTangent(lengths.at(-2) / length, direction);
    const exitRotation = new THREE.Quaternion().setFromRotationMatrix(matrix.lookAt(exit, target.copy(exit).add(direction), up));
    const desired = new THREE.Quaternion();
    const exitAngles = new THREE.Euler().setFromQuaternion(exitRotation, 'YXZ'), angles = new THREE.Euler(0, 0, 0, 'YXZ');
    const busAngles = new THREE.Euler().setFromQuaternion(busRotation, 'YXZ');
    const overview = createGrassDebugV2OverviewPose();
    const startAngles = new THREE.Euler().setFromRotationMatrix(matrix.lookAt(overview.position, overview.target, up), 'YXZ');
    return Object.freeze({
        lookBackStartMs, lookBackEndMs: lookBackStartMs + BENCHMARK_LOOK_BACK_MS,
        busTarget: busTarget.clone(),
        sample(elapsedMs, position, rotation) {
            const fraction = timing.distanceAtTime(elapsedMs), distance = fraction * length;
            if (elapsedMs >= lookBackStartMs) {
                desired.setFromRotationMatrix(matrix.lookAt(position, busTarget, up));
                const blend = easeBenchmarkProgress(THREE.MathUtils.clamp((elapsedMs - lookBackStartMs) / BENCHMARK_LOOK_BACK_MS, 0, 1));
                angles.setFromQuaternion(desired, 'YXZ');
                angles.y = exitAngles.y + THREE.MathUtils.euclideanModulo(angles.y - exitAngles.y, 2 * Math.PI) * blend;
                angles.x = THREE.MathUtils.lerp(exitAngles.x, angles.x, blend);
                angles.z = 0;
                rotation.setFromEuler(angles);
            } else if (distance >= lengths[0] && distance <= lengths[1]) {
                rotation.copy(busRotation);
            } else if (distance > lengths[1] && distance < lengths[2]) {
                const blend = easeBenchmarkProgress((distance - lengths[1]) / (lengths[2] - lengths[1]));
                angles.set(THREE.MathUtils.lerp(busAngles.x, exitAngles.x, blend), busAngles.y, 0, 'YXZ');
                rotation.setFromEuler(angles);
            } else {
                const arrival = easeBenchmarkProgress(THREE.MathUtils.clamp(distance / lengths[0], 0, 1));
                angles.set(THREE.MathUtils.lerp(startAngles.x, busAngles.x, arrival), THREE.MathUtils.lerp(startAngles.y, busAngles.y, arrival), 0, 'YXZ');
                if (distance <= lengths[0]) rotation.setFromEuler(angles); else rotation.copy(exitRotation);
            }
        }
    });
}
