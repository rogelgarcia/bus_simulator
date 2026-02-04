// src/graphics/gui/debug/VehicleMotionDebugOverlay.js
// Lightweight text overlay for investigating one-frame vehicle motion discontinuities.

function normalizeAngleRad(rad) {
    let a = Number(rad);
    if (!Number.isFinite(a)) return 0;
    a = ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a;
}

function yawFromMatrixElements(m) {
    // three.js Matrix4 elements are column-major.
    // Local +Z axis is column 2: (m[8], m[9], m[10])
    const fx = Number(m?.[8]);
    const fz = Number(m?.[10]);
    if (!Number.isFinite(fx) || !Number.isFinite(fz)) return 0;
    return Math.atan2(fx, fz);
}

function readPoseFromObject3D(obj) {
    if (!obj?.updateMatrixWorld || !obj?.matrixWorld?.elements) return null;
    obj.updateMatrixWorld(true);
    const m = obj.matrixWorld.elements;
    const x = Number(m[12]);
    const y = Number(m[13]);
    const z = Number(m[14]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

    const yaw = yawFromMatrixElements(m);
    const fwdX = Number(m[8]);
    const fwdY = Number(m[9]);
    const fwdZ = Number(m[10]);
    return {
        x,
        y,
        z,
        yaw,
        fwdX: Number.isFinite(fwdX) ? fwdX : 0,
        fwdY: Number.isFinite(fwdY) ? fwdY : 0,
        fwdZ: Number.isFinite(fwdZ) ? fwdZ : 1
    };
}

function fmt(n, digits = 3) {
    return Number.isFinite(n) ? Number(n).toFixed(digits) : '-';
}

function mulMat4Vec4(m, x, y, z, w) {
    // m is column-major 4x4 (three.js)
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3];
    const m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7];
    const m8 = m[8], m9 = m[9], m10 = m[10], m11 = m[11];
    const m12 = m[12], m13 = m[13], m14 = m[14], m15 = m[15];
    return {
        x: m0 * x + m4 * y + m8 * z + m12 * w,
        y: m1 * x + m5 * y + m9 * z + m13 * w,
        z: m2 * x + m6 * y + m10 * z + m14 * w,
        w: m3 * x + m7 * y + m11 * z + m15 * w
    };
}

function projectWorldToScreenPx({ camera, x, y, z, width, height }) {
    if (!camera?.updateMatrixWorld || !camera?.projectionMatrix?.elements || !camera?.matrixWorldInverse?.elements) return null;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    camera.updateMatrixWorld(true);
    if (camera.matrixWorldInverse?.copy) camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const view = camera.matrixWorldInverse.elements;
    const proj = camera.projectionMatrix.elements;

    const v = mulMat4Vec4(view, x, y, z, 1);
    const c = mulMat4Vec4(proj, v.x, v.y, v.z, v.w);
    if (!Number.isFinite(c.w) || Math.abs(c.w) < 1e-9) return null;
    const ndcX = c.x / c.w;
    const ndcY = c.y / c.w;
    const px = (ndcX * 0.5 + 0.5) * width;
    const py = (-ndcY * 0.5 + 0.5) * height;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    return { x: px, y: py };
}

export class VehicleMotionDebugOverlay {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'vehicle-motion-debug-overlay hidden';
        this.pre = document.createElement('pre');
        this.pre.className = 'vehicle-motion-debug-overlay-pre';
        this.root.appendChild(this.pre);

        this._enabled = false;
        this._overlayVisible = false;
        this._lastPose = null;
        this._lastLoco = null;
        this._lastTravelDir = null;
        this._lastLocoTravelDir = null;
        this._lastCamToBus = null;
        this._lastCamBusDist = null;
        this._backStepActive = false;
        this._catchupActive = false;
        this._lagActive = false;
        this._targetMismatchActive = false;
        this._lastCameraMode = null;
        this._lastManualReturning = null;
        this._lastNowMs = null;
        this._lastScreen = null;
        this._lastCamera = null;
    }

    attach(parent = document.body) {
        parent.appendChild(this.root);
    }

    destroy() {
        this.root.remove();
    }

    setEnabled(enabled) {
        const next = !!enabled;
        if (next === this._enabled) return;
        this._enabled = next;
        if (this._enabled) return;
        this.setOverlayVisible(false);

        this.pre.textContent = '';
        this._lastPose = null;
        this._lastLoco = null;
        this._lastTravelDir = null;
        this._lastLocoTravelDir = null;
        this._lastCamToBus = null;
        this._lastCamBusDist = null;
        this._backStepActive = false;
        this._catchupActive = false;
        this._lagActive = false;
        this._targetMismatchActive = false;
        this._lastCameraMode = null;
        this._lastManualReturning = null;
        this._lastNowMs = null;
        this._lastScreen = null;
        this._lastCamera = null;
    }

    setOverlayVisible(visible) {
        const next = !!visible;
        if (next === this._overlayVisible) return;
        this._overlayVisible = next;
        this.root.classList.toggle('hidden', !next);
        if (!next) this.pre.textContent = '';
    }

    update({
        nowMs = null,
        dt = 0,
        timing = null,
        physicsLoop = null,
        anchor = null,
        locomotion = null,
        cameraMotion = null,
        camera = null,
        viewport = null,
        settings = null
    } = {}) {
        const debugEnabled = settings?.enabled === true;
        if (!debugEnabled) {
            this.setEnabled(false);
            return;
        }
        this.setEnabled(true);
        this.setOverlayVisible(settings?.overlay !== false);

        const pose = readPoseFromObject3D(anchor);
        const loco = locomotion && typeof locomotion === 'object' ? locomotion : null;
        const locoPos = loco?.position && typeof loco.position === 'object'
            ? { x: Number(loco.position.x), y: Number(loco.position.y), z: Number(loco.position.z) }
            : null;
        const locoYaw = Number.isFinite(loco?.yaw) ? Number(loco.yaw) : null;
        const speed = Number.isFinite(loco?.speed) ? Number(loco.speed) : null;

        const prev = this._lastPose;
        const dx = prev && pose ? pose.x - prev.x : 0;
        const dz = prev && pose ? pose.z - prev.z : 0;
        const dist = Math.hypot(dx, dz);
        const projFwd = (prev && pose) ? (dx * prev.fwdX + dz * prev.fwdZ) : null;
        const yaw = pose ? pose.yaw : 0;
        const dyaw = prev && pose ? normalizeAngleRad(pose.yaw - prev.yaw) : 0;

        const prevLoco = this._lastLoco;
        const locoDxStep = (prevLoco && locoPos) ? (locoPos.x - prevLoco.position.x) : null;
        const locoDzStep = (prevLoco && locoPos) ? (locoPos.z - prevLoco.position.z) : null;
        const locoDistStep = (locoDxStep !== null && locoDzStep !== null) ? Math.hypot(locoDxStep, locoDzStep) : null;
        const locoProjFwd = (() => {
            if (locoDxStep === null || locoDzStep === null) return null;
            const yaw0 = Number.isFinite(prevLoco?.yaw) ? Number(prevLoco.yaw) : null;
            if (yaw0 === null) return null;
            const fx = Math.sin(yaw0);
            const fz = Math.cos(yaw0);
            return locoDxStep * fx + locoDzStep * fz;
        })();

        const now = Number.isFinite(nowMs) ? Number(nowMs) : null;
        const lastNow = Number.isFinite(this._lastNowMs) ? Number(this._lastNowMs) : null;
        const wallDt = (now !== null && lastNow !== null) ? (now - lastNow) / 1000 : null;

        const locoDx = pose && locoPos && Number.isFinite(locoPos.x) ? pose.x - locoPos.x : null;
        const locoDz = pose && locoPos && Number.isFinite(locoPos.z) ? pose.z - locoPos.z : null;
        const locoDist = (locoDx !== null && locoDz !== null) ? Math.hypot(locoDx, locoDz) : null;
        const locoYawErr = (locoYaw !== null && pose) ? (normalizeAngleRad(pose.yaw - locoYaw) * (180 / Math.PI)) : null;
        const maxDist = Number.isFinite(settings?.spike?.maxDistMeters) ? settings.spike.maxDistMeters : null;
        const maxYawDeg = Number.isFinite(settings?.spike?.maxYawDeg) ? settings.spike.maxYawDeg : null;
        const maxScreenPx = Number.isFinite(settings?.spike?.maxScreenPx) ? settings.spike.maxScreenPx : null;
        const backMinProj = Number.isFinite(settings?.backStep?.minProjMeters) ? Number(settings.backStep.minProjMeters) : 0.05;
        const backStep = projFwd !== null && projFwd < -backMinProj;
        const locoBackStep = locoProjFwd !== null && locoProjFwd < -backMinProj;
        const spikeDist = maxDist !== null && dist > maxDist;
        const spikeYaw = maxYawDeg !== null && Math.abs(dyaw * (180 / Math.PI)) > maxYawDeg;

        const travelProj = this._lastTravelDir && prev && pose
            ? (dx * this._lastTravelDir.x + dz * this._lastTravelDir.z)
            : null;
        const travelBackStep = travelProj !== null && travelProj < -backMinProj;

        const locoTravelProj = this._lastLocoTravelDir && locoDxStep !== null && locoDzStep !== null
            ? (locoDxStep * this._lastLocoTravelDir.x + locoDzStep * this._lastLocoTravelDir.z)
            : null;
        const locoTravelBackStep = locoTravelProj !== null && locoTravelProj < -backMinProj;

        const vpW = Number(viewport?.width);
        const vpH = Number(viewport?.height);
        const screen = pose
            ? projectWorldToScreenPx({ camera, x: pose.x, y: pose.y, z: pose.z, width: vpW, height: vpH })
            : null;
        const prevScreen = this._lastScreen;
        const sdx = prevScreen && screen ? screen.x - prevScreen.x : null;
        const sdy = prevScreen && screen ? screen.y - prevScreen.y : null;
        const sdist = (sdx !== null && sdy !== null) ? Math.hypot(sdx, sdy) : null;
        const spikeScreen = maxScreenPx !== null && sdist !== null && sdist > maxScreenPx;

        const logMinScreenPx = Number.isFinite(settings?.logGate?.minScreenPx) ? Number(settings.logGate.minScreenPx) : 3;
        const logVisual = logMinScreenPx <= 0 || (sdist !== null && sdist >= logMinScreenPx);

        const spike = (prev && pose) ? (spikeDist || spikeYaw || spikeScreen) : false;

        const camPos = (() => {
            const p = camera?.position ?? null;
            const x = Number(p?.x);
            const y = Number(p?.y);
            const z = Number(p?.z);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
            return { x, y, z };
        })();
        const prevCam = this._lastCamera;
        const camDx = (camPos && prevCam) ? (camPos.x - prevCam.x) : null;
        const camDy = (camPos && prevCam) ? (camPos.y - prevCam.y) : null;
        const camDz = (camPos && prevCam) ? (camPos.z - prevCam.z) : null;
        const camDist = (camDx !== null && camDy !== null && camDz !== null) ? Math.hypot(camDx, camDy, camDz) : null;

        const camToBus = (() => {
            if (!camPos || !pose) return null;
            if (!camera?.updateMatrixWorld || !camera?.matrixWorld?.elements) return null;
            camera.updateMatrixWorld(true);
            const m = camera.matrixWorld.elements;
            // Camera local -Z is "forward" in world space: forward = -column2.
            const fwdX = -Number(m[8]);
            const fwdY = -Number(m[9]);
            const fwdZ = -Number(m[10]);
            const rightX = Number(m[0]);
            const rightY = Number(m[1]);
            const rightZ = Number(m[2]);
            if (!Number.isFinite(fwdX) || !Number.isFinite(fwdY) || !Number.isFinite(fwdZ)) return null;
            if (!Number.isFinite(rightX) || !Number.isFinite(rightY) || !Number.isFinite(rightZ)) return null;

            const rx = pose.x - camPos.x;
            const ry = pose.y - camPos.y;
            const rz = pose.z - camPos.z;
            const relFwd = rx * fwdX + ry * fwdY + rz * fwdZ;
            const relRight = rx * rightX + ry * rightY + rz * rightZ;
            if (!Number.isFinite(relFwd) || !Number.isFinite(relRight)) return null;
            return { relFwd, relRight };
        })();
        const prevCamToBus = this._lastCamToBus;
        const camToBusDfwd = (camToBus && prevCamToBus) ? (camToBus.relFwd - prevCamToBus.relFwd) : null;

        const camMotion = cameraMotion && typeof cameraMotion === 'object' ? cameraMotion : null;
        const camMode = typeof camMotion?.mode === 'string' ? camMotion.mode : null;
        const camDesired = camMotion?.desired && typeof camMotion.desired === 'object'
            ? { x: Number(camMotion.desired.x), y: Number(camMotion.desired.y), z: Number(camMotion.desired.z) }
            : null;
        const chaseDesired = camMotion?.chase?.desired && typeof camMotion.chase.desired === 'object'
            ? { x: Number(camMotion.chase.desired.x), y: Number(camMotion.chase.desired.y), z: Number(camMotion.chase.desired.z) }
            : null;
        const chaseAlpha = Number.isFinite(camMotion?.chase?.alpha) ? Number(camMotion.chase.alpha) : null;
        const manualState = camMotion?.manual && typeof camMotion.manual === 'object'
            ? {
                hasOverride: camMotion.manual.hasOverride === true,
                active: camMotion.manual.active === true,
                returning: camMotion.manual.returning === true,
                idleTime: Number.isFinite(camMotion.manual.idleTime) ? Number(camMotion.manual.idleTime) : null,
                returnElapsed: Number.isFinite(camMotion.manual.returnElapsed) ? Number(camMotion.manual.returnElapsed) : null,
                returnDuration: Number.isFinite(camMotion.manual.returnDuration) ? Number(camMotion.manual.returnDuration) : null,
                applied: camMotion.manual.applied === true,
                anchorMatrixNeedsUpdate: camMotion.manual.anchorMatrixNeedsUpdate === true ? true : camMotion.manual.anchorMatrixNeedsUpdate === false ? false : null,
                anchorMatrixErr: Number.isFinite(camMotion.manual.anchorMatrixErr) ? Number(camMotion.manual.anchorMatrixErr) : null,
                busModelMatrixNeedsUpdate: camMotion.manual.busModelMatrixNeedsUpdate === true ? true : camMotion.manual.busModelMatrixNeedsUpdate === false ? false : null,
                appliedTarget: camMotion.manual.appliedTarget && typeof camMotion.manual.appliedTarget === 'object'
                    ? {
                        x: Number(camMotion.manual.appliedTarget.x),
                        y: Number(camMotion.manual.appliedTarget.y),
                        z: Number(camMotion.manual.appliedTarget.z)
                    }
                    : null
            }
            : null;
        const camToDesiredDist = (() => {
            if (!camPos || !camDesired) return null;
            const dx = camPos.x - camDesired.x;
            const dy = camPos.y - camDesired.y;
            const dz = camPos.z - camDesired.z;
            const d = Math.hypot(dx, dy, dz);
            return Number.isFinite(d) ? d : null;
        })();
        const camToChaseDesiredDist = (() => {
            if (!camPos || !chaseDesired) return null;
            const dx = camPos.x - chaseDesired.x;
            const dy = camPos.y - chaseDesired.y;
            const dz = camPos.z - chaseDesired.z;
            const d = Math.hypot(dx, dy, dz);
            return Number.isFinite(d) ? d : null;
        })();

        const catchupDfwdMin = Number.isFinite(settings?.cameraCatchup?.minDfwdMeters) ? Number(settings.cameraCatchup.minDfwdMeters) : 0.05;
        const catchupCamMoveMin = Number.isFinite(settings?.cameraCatchup?.minCameraMoveMeters) ? Number(settings.cameraCatchup.minCameraMoveMeters) : 0.01;
        const catchupDistDropMin = Number.isFinite(settings?.cameraCatchup?.minCamBusDistDropMeters) ? Number(settings.cameraCatchup.minCamBusDistDropMeters) : 0.05;

        const camBusDist = (() => {
            if (!camPos || !pose) return null;
            const dx = camPos.x - pose.x;
            const dy = camPos.y - pose.y;
            const dz = camPos.z - pose.z;
            const d = Math.hypot(dx, dy, dz);
            return Number.isFinite(d) ? d : null;
        })();
        const prevCamBusDist = this._lastCamBusDist;
        const camBusDistDelta = (camBusDist !== null && prevCamBusDist !== null) ? (camBusDist - prevCamBusDist) : null;

        const cameraCatchup = camToBusDfwd !== null
            && camToBusDfwd < -catchupDfwdMin
            && camDist !== null
            && camDist >= catchupCamMoveMin;

        const cameraCatchupDist = camBusDistDelta !== null
            && camBusDistDelta < -catchupDistDropMin
            && camDist !== null
            && camDist >= catchupCamMoveMin;

        const lagMinBusStep = Number.isFinite(settings?.cameraLag?.minBusStepMeters) ? Number(settings.cameraLag.minBusStepMeters) : 0.2;
        const lagMaxRatio = Number.isFinite(settings?.cameraLag?.maxCamStepRatio) ? Number(settings.cameraLag.maxCamStepRatio) : 0.55;
        const camStepRatio = (Number.isFinite(dist) && dist > 1e-9 && camDist !== null) ? (camDist / dist) : null;
        const cameraLag = camStepRatio !== null
            && dist >= lagMinBusStep
            && camStepRatio < lagMaxRatio;

        const targetMismatchMin = Number.isFinite(settings?.cameraTargetMismatch?.minAnchorMatrixErrMeters)
            ? Number(settings.cameraTargetMismatch.minAnchorMatrixErrMeters)
            : 0.02;
        const targetMismatch = camMode === 'manual'
            && manualState?.applied === true
            && manualState.anchorMatrixErr !== null
            && manualState.anchorMatrixErr >= targetMismatchMin;

        const lines = [];
        lines.push('Vehicle motion debug');
        lines.push(`dt: ${fmt(dt, 4)}  fps~${dt > 1e-9 ? fmt(1 / dt, 1) : '-'}`);
        if (timing) {
            lines.push(`rawDt: ${fmt(timing.rawDt, 4)}  clampedDt: ${fmt(timing.clampedDt, 4)}  synthetic: ${timing.synthetic?.pattern ?? 'off'}`);
        }
        if (physicsLoop) {
            lines.push(`physics fixedDt: ${fmt(physicsLoop.fixedDt, 4)}  substeps: ${physicsLoop.subStepsLastFrame ?? '-'}  alpha: ${fmt(physicsLoop.alpha, 3)}`);
        }
        if (pose) {
            lines.push(`pos: (${fmt(pose.x, 3)}, ${fmt(pose.y, 3)}, ${fmt(pose.z, 3)})  yaw: ${fmt(yaw * (180 / Math.PI), 1)}°`);
        } else {
            lines.push('pos: (missing)');
        }
        if (prev && pose) {
            lines.push(`dpos: dx ${fmt(dx, 3)} dz ${fmt(dz, 3)} dist ${fmt(dist, 3)}  dyaw ${fmt(dyaw * (180 / Math.PI), 1)}°`);
            lines.push(`proj fwd: ${projFwd !== null ? `${fmt(projFwd, 3)}m` : '-'}  (physics: ${locoProjFwd !== null ? `${fmt(locoProjFwd, 3)}m` : '-'})`);
            if (travelProj !== null || locoTravelProj !== null) {
                lines.push(`proj travel: ${travelProj !== null ? `${fmt(travelProj, 3)}m` : '-'}  (physics: ${locoTravelProj !== null ? `${fmt(locoTravelProj, 3)}m` : '-'})`);
            }
        }
        if (screen) {
            lines.push(`screen: ${fmt(screen.x, 1)}, ${fmt(screen.y, 1)}${sdist !== null ? `  dpx ${fmt(sdist, 1)}` : ''}`);
        }
        if (camPos) {
            lines.push(`cam: (${fmt(camPos.x, 2)}, ${fmt(camPos.y, 2)}, ${fmt(camPos.z, 2)})${camDist !== null ? `  dcam ${fmt(camDist, 3)}` : ''}`);
        }
        if (camToBus) {
            lines.push(`cam→bus fwd: ${fmt(camToBus.relFwd, 3)}m${camToBusDfwd !== null ? `  dfwd ${fmt(camToBusDfwd, 3)}m` : ''}`);
        }
        if (camMode) {
            const bits = [];
            bits.push(`camera mode: ${camMode}`);
            if (camToDesiredDist !== null) bits.push(`|cam-desired| ${fmt(camToDesiredDist, 3)}m`);
            if (camToChaseDesiredDist !== null) bits.push(`|cam-chase| ${fmt(camToChaseDesiredDist, 3)}m`);
            if (chaseAlpha !== null) bits.push(`alpha ${fmt(chaseAlpha, 3)}`);
            lines.push(bits.join('  '));
            if (manualState?.hasOverride) {
                lines.push(`manual: returning ${manualState.returning ? 'YES' : 'no'}  idle ${manualState.idleTime !== null ? fmt(manualState.idleTime, 2) : '-'}s  t ${manualState.returnElapsed !== null ? fmt(manualState.returnElapsed, 2) : '-'}s`);
            }
        }
        if (camBusDist !== null) {
            lines.push(`cam↔bus dist: ${fmt(camBusDist, 3)}m${camBusDistDelta !== null ? `  d ${fmt(camBusDistDelta, 3)}m` : ''}`);
        }
        if (speed !== null) {
            lines.push(`physics speed: ${fmt(speed, 2)} m/s`);
        }
        if (locoDist !== null || locoYawErr !== null) {
            lines.push(`render-vs-physics: posErr ${fmt(locoDist, 3)}m  yawErr ${fmt(locoYawErr, 2)}°`);
        }
        if (wallDt !== null) {
            lines.push(`wall dt: ${fmt(wallDt, 4)}`);
        }
        if (backStep || locoBackStep || travelBackStep || locoTravelBackStep) {
            const bits = [];
            if (backStep) bits.push(`anchorFwd<-${fmt(backMinProj, 2)}m`);
            if (locoBackStep) bits.push(`physicsYawFwd<-${fmt(backMinProj, 2)}m`);
            if (travelBackStep) bits.push(`anchorTravel<-${fmt(backMinProj, 2)}m`);
            if (locoTravelBackStep) bits.push(`physicsTravel<-${fmt(backMinProj, 2)}m`);
            lines.push(`BACKSTEP: ${bits.join(' ')}`);
        }
        if (spike) {
            const bits = [];
            if (spikeDist) bits.push(`dist>${fmt(maxDist, 2)}m`);
            if (spikeYaw) bits.push(`yaw>${fmt(maxYawDeg, 0)}°`);
            if (spikeScreen) bits.push(`screen>${fmt(maxScreenPx, 0)}px`);
            lines.push(`SPIKE: ${bits.join(' ')}`);
        }

        if (this._overlayVisible) this.pre.textContent = lines.join('\n');

        const anyBackStep = backStep || locoBackStep || travelBackStep || locoTravelBackStep;
        const shouldLogBackStep = anyBackStep && settings?.logSpikes === true && this._backStepActive === false;
        const anyCatchup = cameraCatchup || cameraCatchupDist;
        const shouldLogCatchup = logVisual && anyCatchup && settings?.logCameraCatchup === true && this._catchupActive === false;
        const shouldLogLag = logVisual && cameraLag && settings?.logCameraLag === true && this._lagActive === false;
        const shouldLogTargetMismatch = logVisual && targetMismatch && settings?.logCameraTargetMismatch === true && this._targetMismatchActive === false;
        const shouldLogCameraMode = settings?.logCameraEvents === true
            && camMode
            && camMode !== this._lastCameraMode;
        const shouldLogManualReturning = settings?.logCameraEvents === true
            && manualState
            && this._lastManualReturning !== null
            && manualState.returning !== this._lastManualReturning;
        if (shouldLogBackStep) {
            const timingSnap = timing && typeof timing === 'object'
                ? {
                    nowMs: Number.isFinite(timing.nowMs) ? timing.nowMs : null,
                    rawDt: Number.isFinite(timing.rawDt) ? timing.rawDt : null,
                    clampedDt: Number.isFinite(timing.clampedDt) ? timing.clampedDt : null,
                    dt: Number.isFinite(timing.dt) ? timing.dt : null,
                    fps: Number.isFinite(timing.fps) ? timing.fps : null,
                    synthetic: timing.synthetic && typeof timing.synthetic === 'object' ? { ...timing.synthetic } : null
                }
                : null;

            const physicsSnap = physicsLoop && typeof physicsLoop === 'object'
                ? {
                    fixedDt: Number.isFinite(physicsLoop.fixedDt) ? physicsLoop.fixedDt : null,
                    maxSubSteps: Number.isFinite(physicsLoop.maxSubSteps) ? physicsLoop.maxSubSteps : null,
                    accum: Number.isFinite(physicsLoop.accum) ? physicsLoop.accum : null,
                    alpha: Number.isFinite(physicsLoop.alpha) ? physicsLoop.alpha : null,
                    subStepsLastFrame: Number.isFinite(physicsLoop.subStepsLastFrame) ? physicsLoop.subStepsLastFrame : null
                }
                : null;

            const locoSnap = loco && typeof loco === 'object'
                ? {
                    position: loco.position && typeof loco.position === 'object'
                        ? { x: Number(loco.position.x), y: Number(loco.position.y), z: Number(loco.position.z) }
                        : null,
                    yaw: Number(loco.yaw),
                    speed: Number(loco.speed),
                    speedKph: Number(loco.speedKph)
                }
                : null;

            const effectiveFixed = physicsSnap?.fixedDt ?? null;
            const steps = physicsSnap?.subStepsLastFrame ?? null;
            const physicsAdvancedDt = (effectiveFixed !== null && steps !== null) ? steps * effectiveFixed : null;
            const expectedDistFrameDt = (speed !== null && Number.isFinite(dt)) ? speed * dt : null;
            const expectedDistPhysicsDt = (speed !== null && physicsAdvancedDt !== null) ? speed * physicsAdvancedDt : null;

            console.warn('[VehicleMotionDebug] backstep', {
                dt,
                dist,
                dx,
                dz,
                projFwd,
                locoDistStep,
                locoProjFwd,
                travelProj,
                locoTravelProj,
                dyawDeg: dyaw * (180 / Math.PI),
                screenPx: sdist,
                cameraDist: camDist,
                camToBus: camToBus ?? null,
                camToBusDfwd,
                speed,
                physicsAdvancedDt,
                expectedDistFrameDt,
                expectedDistPhysicsDt,
                timing: timingSnap,
                physicsLoop: physicsSnap,
                pose,
                locomotion: locoSnap
            });
        }

        if (shouldLogCatchup) {
            console.warn('[VehicleMotionDebug] cameraCatchup', {
                dt,
                cameraMode: camMode,
                camToDesiredDist,
                camToChaseDesiredDist,
                chaseAlpha,
                manual: manualState,
                cameraDist: camDist,
                camToBus: camToBus ?? null,
                camToBusDfwd,
                camBusDist,
                camBusDistDelta,
                anchorStep: { dist, dx, dz, projFwd, travelProj },
                physicsStep: { dist: locoDistStep, projFwd: locoProjFwd, travelProj: locoTravelProj },
                renderVsPhysics: { posErr: locoDist, yawErrDeg: locoYawErr },
                screenPx: sdist,
                timing: timing && typeof timing === 'object'
                    ? {
                        nowMs: Number.isFinite(timing.nowMs) ? timing.nowMs : null,
                        rawDt: Number.isFinite(timing.rawDt) ? timing.rawDt : null,
                        clampedDt: Number.isFinite(timing.clampedDt) ? timing.clampedDt : null,
                        dt: Number.isFinite(timing.dt) ? timing.dt : null,
                        fps: Number.isFinite(timing.fps) ? timing.fps : null,
                        synthetic: timing.synthetic && typeof timing.synthetic === 'object' ? { ...timing.synthetic } : null
                    }
                    : null
            });
        }

        if (shouldLogLag) {
            console.warn('[VehicleMotionDebug] cameraLag', {
                dt,
                cameraMode: camMode,
                camToDesiredDist,
                camToChaseDesiredDist,
                chaseAlpha,
                manual: manualState,
                cameraDist: camDist,
                camStepRatio,
                camBusDist,
                camBusDistDelta,
                anchorStep: { dist, dx, dz, projFwd, travelProj },
                physicsStep: { dist: locoDistStep, projFwd: locoProjFwd, travelProj: locoTravelProj },
                renderVsPhysics: { posErr: locoDist, yawErrDeg: locoYawErr },
                screenPx: sdist,
                timing: timing && typeof timing === 'object'
                    ? {
                        nowMs: Number.isFinite(timing.nowMs) ? timing.nowMs : null,
                        rawDt: Number.isFinite(timing.rawDt) ? timing.rawDt : null,
                        clampedDt: Number.isFinite(timing.clampedDt) ? timing.clampedDt : null,
                        dt: Number.isFinite(timing.dt) ? timing.dt : null,
                        fps: Number.isFinite(timing.fps) ? timing.fps : null,
                        synthetic: timing.synthetic && typeof timing.synthetic === 'object' ? { ...timing.synthetic } : null
                    }
                    : null
            });
        }

        if (shouldLogTargetMismatch) {
            console.warn('[VehicleMotionDebug] cameraTargetMismatch', {
                dt,
                cameraMode: camMode,
                manual: manualState,
                targetMismatchMin,
                cameraDist: camDist,
                camBusDist,
                camBusDistDelta,
                anchorStep: { dist, dx, dz, projFwd, travelProj },
                timing: timing && typeof timing === 'object'
                    ? {
                        nowMs: Number.isFinite(timing.nowMs) ? timing.nowMs : null,
                        rawDt: Number.isFinite(timing.rawDt) ? timing.rawDt : null,
                        clampedDt: Number.isFinite(timing.clampedDt) ? timing.clampedDt : null,
                        dt: Number.isFinite(timing.dt) ? timing.dt : null,
                        fps: Number.isFinite(timing.fps) ? timing.fps : null,
                        synthetic: timing.synthetic && typeof timing.synthetic === 'object' ? { ...timing.synthetic } : null
                    }
                    : null
            });
        }

        if (shouldLogCameraMode) {
            console.warn('[VehicleMotionDebug] cameraMode', {
                dt,
                cameraMode: camMode,
                camToChaseDesiredDist,
                chaseAlpha,
                manual: manualState
            });
        }

        if (shouldLogManualReturning) {
            console.warn('[VehicleMotionDebug] manualReturn', {
                dt,
                returning: manualState?.returning ?? null,
                idleTime: manualState?.idleTime ?? null,
                returnElapsed: manualState?.returnElapsed ?? null,
                returnDuration: manualState?.returnDuration ?? null
            });
        }

        this._lastPose = pose;
        this._lastLoco = locoPos
            ? { position: { x: locoPos.x, y: locoPos.y, z: locoPos.z }, yaw: locoYaw }
            : null;
        this._lastCamToBus = camToBus;
        this._lastCamBusDist = camBusDist;
        this._backStepActive = anyBackStep;
        this._catchupActive = anyCatchup;
        this._lagActive = cameraLag;
        this._targetMismatchActive = targetMismatch;
        if (camMode) this._lastCameraMode = camMode;
        if (manualState) this._lastManualReturning = manualState.returning;

        if (prev && pose && dist > 1e-6) {
            this._lastTravelDir = { x: dx / dist, z: dz / dist };
        }
        if (locoDxStep !== null && locoDzStep !== null && locoDistStep !== null && locoDistStep > 1e-6) {
            this._lastLocoTravelDir = { x: locoDxStep / locoDistStep, z: locoDzStep / locoDistStep };
        }

        this._lastScreen = screen;
        this._lastCamera = camPos;
        if (now !== null) this._lastNowMs = now;
    }
}
