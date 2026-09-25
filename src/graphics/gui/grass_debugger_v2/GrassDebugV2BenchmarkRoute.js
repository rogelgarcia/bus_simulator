// Smooth camera route from Overview through the bus, low sidewalk pass and final view.
// @ts-check
import * as THREE from 'three';
import { createGrassDebugV2OverviewPose } from './GrassDebugV2CameraPresets.js';

export const BENCHMARK_BASE_FLIGHT_MS = 24_000;
export const BENCHMARK_WARMUP_MS = 2_000;
export const BENCHMARK_FINAL_HOLD_MS = 1_000;

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

/** @param {THREE.Vector3} busPosition */
export function createBenchmarkRoute(busPosition) {
    const overview = createGrassDebugV2OverviewPose();
    const startDirection = overview.target.clone().sub(overview.position).normalize();
    const points = [
        overview.position,
        busPosition.clone(),
        new THREE.Vector3(-2.4, 6.883, 5.421),
        new THREE.Vector3(-8.012, 1.258, 14.806),
        new THREE.Vector3(-8.012, 1.258, 24.806),
        new THREE.Vector3(14.39, 8.247, 48.256)
    ];
    const forward = new THREE.Vector3(0, 0, 1);
    const finishDirection = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(-23.461), THREE.MathUtils.degToRad(21.273), 0, 'YXZ'
    ));
    const route = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) {
        route.add(new FlightLeg(points[i], points[i + 1], i === 0 ? startDirection : forward, i === points.length - 2 ? finishDirection : forward));
    }
    route.updateArcLengths();
    return route;
}

/** @param {THREE.CurvePath<THREE.Vector3>} route */
export function createBenchmarkFlightTiming(route) {
    const length = route.getLength();
    const lengths = route.getCurveLengths();
    const sidewalkStart = lengths.at(-3);
    const sidewalkEnd = lengths.at(-2);
    const baseDurationMs = BENCHMARK_BASE_FLIGHT_MS * length / (length - lengths[0]);
    const speedScale = distance => distance < sidewalkStart
        ? 1 - 0.5 * easeBenchmarkProgress(THREE.MathUtils.clamp((distance - sidewalkStart + 5) / 5, 0, 1))
        : 0.5 + 0.5 * easeBenchmarkProgress(THREE.MathUtils.clamp((distance - sidewalkEnd) / 5, 0, 1));
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
