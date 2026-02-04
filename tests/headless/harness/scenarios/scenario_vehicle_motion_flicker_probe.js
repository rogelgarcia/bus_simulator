// Vehicle motion probe: measures per-frame discontinuities under uneven dt.
import { VehicleController } from '/src/app/vehicle/VehicleController.js';

function normalizeAngleRad(rad) {
    let a = Number(rad);
    if (!Number.isFinite(a)) return 0;
    a = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a;
}

function yawFromMatrixElements(m) {
    const fx = Number(m?.[8]);
    const fz = Number(m?.[10]);
    if (!Number.isFinite(fx) || !Number.isFinite(fz)) return 0;
    return Math.atan2(fx, fz);
}

function readXZYaw(obj) {
    if (!obj?.updateMatrixWorld || !obj?.matrixWorld?.elements) return null;
    obj.updateMatrixWorld(true);
    const m = obj.matrixWorld.elements;
    const x = Number(m[12]);
    const z = Number(m[14]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z, yaw: yawFromMatrixElements(m), fwdX: Number(m[8]) || 0, fwdZ: Number(m[10]) || 1 };
}

export const scenarioVehicleMotionFlickerProbe = {
    id: 'vehicle_motion_flicker_probe',
    async create({ engine, THREE, options }) {
        engine.clearScene();

        engine.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(30, 60, 40);
        engine.scene.add(sun);

        // Side-biased camera to make forward motion produce visible screen-space movement.
        engine.camera.position.set(20, 4, 0);
        engine.camera.lookAt(0, 1, 12);

        const anchor = new THREE.Group();
        anchor.position.set(0, 0, 0);
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 1.6, 6.2),
            new THREE.MeshStandardMaterial({ color: 0x66ccff, metalness: 0.0, roughness: 0.7 })
        );
        body.position.y = 1.0;
        anchor.add(body);
        engine.scene.add(anchor);

        const smoothing = options?.visualSmoothing && typeof options.visualSmoothing === 'object' ? options.visualSmoothing : null;
        if (smoothing) {
            engine.setVehicleVisualSmoothingSettings?.(smoothing);
        } else {
            engine.setVehicleVisualSmoothingSettings?.({ enabled: false });
        }

        const target = { x: 0, z: 0, yaw: 0 };
        const speedMps = Number.isFinite(options?.speedMps) ? Number(options.speedMps) : 12.0;

        const fakeEventBus = {
            on() { return () => {}; }
        };
        const fakePhysics = {
            setInput() {},
            getVehicleState(vehicleId) {
                if (vehicleId !== 'player') return null;
                return {
                    locomotion: {
                        position: { x: target.x, y: 0, z: target.z },
                        yaw: target.yaw,
                        speed: speedMps,
                        speedKph: speedMps * 3.6,
                        steerAngle: 0,
                        steerAngleLeft: 0,
                        steerAngleRight: 0,
                        wheelSpinAccum: 0
                    }
                };
            }
        };

        const controller = new VehicleController('player', fakePhysics, fakeEventBus, {
            getVisualSmoothingSettings: () => engine.vehicleVisualSmoothingSettings
        });
        controller.setVehicleApi(null, anchor);

        const samples = [];
        let prev = null;
        const tmp = new THREE.Vector3();
        const tmpSize = new THREE.Vector2();
        let prevScreen = null;
        let maxScreenPx = 0;
        let maxFrameDist = 0;
        let spikes = 0;
        let spikeMaxDist = 0;
        let spikeMaxYawDeg = 0;
        let frames = 0;
        let lastScreen = null;

        const maxDist = Number.isFinite(options?.maxDistMeters) ? Number(options.maxDistMeters) : 0.9;
        const maxYawDeg = Number.isFinite(options?.maxYawDeg) ? Number(options.maxYawDeg) : 25;

        return {
            update(dt) {
                target.z += speedMps * Math.max(0, Number(dt) || 0);
                controller.update(dt);

                const cur = readXZYaw(anchor);
                if (!cur) return;
                if (prev) {
                    const dx = cur.x - prev.x;
                    const dz = cur.z - prev.z;
                    const dist = Math.hypot(dx, dz);
                    const dyaw = normalizeAngleRad(cur.yaw - prev.yaw) * (180 / Math.PI);
                    const proj = dx * prev.fwdX + dz * prev.fwdZ;
                    samples.push({ dt, dx, dz, dist, dyaw, proj });
                    if (Number.isFinite(dist)) maxFrameDist = Math.max(maxFrameDist, dist);
                    const isSpike = dist > maxDist || Math.abs(dyaw) > maxYawDeg;
                    if (isSpike) {
                        spikes++;
                        spikeMaxDist = Math.max(spikeMaxDist, dist);
                        spikeMaxYawDeg = Math.max(spikeMaxYawDeg, Math.abs(dyaw));
                    }
                }

                // Screen-space motion (use current camera + renderer size).
                engine.renderer?.getSize?.(tmpSize);
                const w = Number(tmpSize.x);
                const h = Number(tmpSize.y);
                if (w > 0 && h > 0) {
                    tmp.set(cur.x, 1.0, cur.z).project(engine.camera);
                    const sx = (tmp.x * 0.5 + 0.5) * w;
                    const sy = (-tmp.y * 0.5 + 0.5) * h;
                    if (Number.isFinite(sx) && Number.isFinite(sy)) {
                        if (prevScreen) {
                            const ddx = sx - prevScreen.x;
                            const ddy = sy - prevScreen.y;
                            const dpx = Math.hypot(ddx, ddy);
                            if (Number.isFinite(dpx)) maxScreenPx = Math.max(maxScreenPx, dpx);
                        }
                        prevScreen = { x: sx, y: sy };
                        lastScreen = prevScreen;
                    }
                }
                prev = cur;
                frames++;
            },
            getMetrics() {
                return {
                    frames,
                    spikes,
                    spikeMaxDist,
                    spikeMaxYawDeg,
                    maxScreenPx,
                    maxFrameDist,
                    lastScreen,
                    sampleCount: samples.length,
                    lastSample: samples[samples.length - 1] ?? null
                };
            },
            dispose() {
                anchor.removeFromParent?.();
                engine.clearScene();
            }
        };
    }
};
