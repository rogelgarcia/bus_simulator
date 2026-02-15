import { makeEl, makeNumberSliderRow, makeSelectRow, makeToggleRow, makeValueRow } from '../OptionsUiControls.js';

export function renderDebugTab() {
    this._ensureDraftVehicleMotionDebug();
    const dbg = this._draftVehicleMotionDebug;
    const logGate = dbg.logGate ?? (dbg.logGate = {});
    const camera = dbg.camera ?? (dbg.camera = {});
    const backStep = dbg.backStep ?? (dbg.backStep = {});
    const cameraCatchup = dbg.cameraCatchup ?? (dbg.cameraCatchup = {});
    const cameraLag = dbg.cameraLag ?? (dbg.cameraLag = {});
    const cameraTargetMismatch = dbg.cameraTargetMismatch ?? (dbg.cameraTargetMismatch = {});
    const spike = dbg.spike ?? (dbg.spike = {});
    const syntheticDt = dbg.syntheticDt ?? (dbg.syntheticDt = {});
    const emit = () => this._emitLiveChange();

    const sectionVehicle = makeEl('div', 'options-section');
    sectionVehicle.appendChild(makeEl('div', 'options-section-title', 'Vehicle motion'));

    const controls = {
        freezeCamera: makeToggleRow({
            label: 'Freeze camera (debug)',
            value: camera.freeze === true,
            onChange: (v) => { camera.freeze = v; emit(); }
        }),
        enabled: makeToggleRow({
            label: 'Enable vehicle motion debug',
            value: dbg.enabled,
            onChange: (v) => { dbg.enabled = v; emit(); }
        }),
        overlay: makeToggleRow({
            label: 'Overlay',
            value: dbg.overlay !== false,
            onChange: (v) => { dbg.overlay = v; emit(); }
        }),
        logSpikes: makeToggleRow({
            label: 'Console log backsteps',
            value: dbg.logSpikes === true,
            onChange: (v) => { dbg.logSpikes = v; emit(); }
        }),
        logCatchup: makeToggleRow({
            label: 'Console log camera catch-up',
            value: dbg.logCameraCatchup === true,
            onChange: (v) => { dbg.logCameraCatchup = v; emit(); }
        }),
        logLag: makeToggleRow({
            label: 'Console log camera lag',
            value: dbg.logCameraLag === true,
            onChange: (v) => { dbg.logCameraLag = v; emit(); }
        }),
        logCameraEvents: makeToggleRow({
            label: 'Console log camera events',
            value: dbg.logCameraEvents === true,
            onChange: (v) => { dbg.logCameraEvents = v; emit(); }
        }),
        logCameraTargetMismatch: makeToggleRow({
            label: 'Console log camera target mismatch',
            value: dbg.logCameraTargetMismatch === true,
            onChange: (v) => { dbg.logCameraTargetMismatch = v; emit(); }
        }),
        logMinScreenPx: makeNumberSliderRow({
            label: 'Log gate: min bus screen delta (px)',
            value: logGate.minScreenPx ?? 3,
            min: 0,
            max: 100,
            step: 1,
            digits: 0,
            onChange: (v) => { logGate.minScreenPx = v; emit(); }
        }),
        backStep: makeNumberSliderRow({
            label: 'Backstep threshold: proj (m)',
            value: backStep.minProjMeters ?? 0.05,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { backStep.minProjMeters = v; emit(); }
        }),
        catchupDfwd: makeNumberSliderRow({
            label: 'Catch-up threshold: cam→bus dfwd (m)',
            value: cameraCatchup.minDfwdMeters ?? 0.05,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraCatchup.minDfwdMeters = v; emit(); }
        }),
        catchupCamMove: makeNumberSliderRow({
            label: 'Catch-up min camera move (m)',
            value: cameraCatchup.minCameraMoveMeters ?? 0.01,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraCatchup.minCameraMoveMeters = v; emit(); }
        }),
        catchupDistDrop: makeNumberSliderRow({
            label: 'Catch-up threshold: cam↔bus dist drop (m)',
            value: cameraCatchup.minCamBusDistDropMeters ?? 0.05,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraCatchup.minCamBusDistDropMeters = v; emit(); }
        }),
        lagBusStep: makeNumberSliderRow({
            label: 'Lag threshold: bus step (m)',
            value: cameraLag.minBusStepMeters ?? 0.2,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraLag.minBusStepMeters = v; emit(); }
        }),
        lagRatio: makeNumberSliderRow({
            label: 'Lag threshold: cam/bus step ratio',
            value: cameraLag.maxCamStepRatio ?? 0.55,
            min: 0,
            max: 1,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraLag.maxCamStepRatio = v; emit(); }
        }),
        targetMatrixErr: makeNumberSliderRow({
            label: 'Target mismatch threshold: anchor matrix err (m)',
            value: cameraTargetMismatch.minAnchorMatrixErrMeters ?? 0.02,
            min: 0,
            max: 2,
            step: 0.01,
            digits: 2,
            onChange: (v) => { cameraTargetMismatch.minAnchorMatrixErrMeters = v; emit(); }
        }),
        maxDist: makeNumberSliderRow({
            label: 'Spike threshold: dist (m)',
            value: spike.maxDistMeters ?? 0.9,
            min: 0.05,
            max: 5,
            step: 0.01,
            digits: 2,
            onChange: (v) => { spike.maxDistMeters = v; emit(); }
        }),
        maxYaw: makeNumberSliderRow({
            label: 'Spike threshold: yaw (deg)',
            value: spike.maxYawDeg ?? 25,
            min: 1,
            max: 180,
            step: 1,
            digits: 0,
            onChange: (v) => { spike.maxYawDeg = v; emit(); }
        }),
        maxScreen: makeNumberSliderRow({
            label: 'Spike threshold: screen (px)',
            value: spike.maxScreenPx ?? 18,
            min: 1,
            max: 300,
            step: 1,
            digits: 0,
            onChange: (v) => { spike.maxScreenPx = v; emit(); }
        }),
        syntheticEnabled: makeToggleRow({
            label: 'Synthetic low/uneven FPS (dt forcing)',
            value: syntheticDt.enabled === true,
            onChange: (v) => {
                syntheticDt.enabled = v;
                if (v && (!syntheticDt.pattern || syntheticDt.pattern === 'off')) syntheticDt.pattern = 'alt60_20';
                if (!v) syntheticDt.pattern = syntheticDt.pattern ?? 'off';
                emit();
                syncSynthetic();
            }
        }),
        syntheticMode: makeSelectRow({
            label: 'Synthetic mode',
            value: String(syntheticDt.mode ?? 'dt'),
            options: [
                { id: 'stall', label: 'Stall (real dt spikes, real-time)' },
                { id: 'dt', label: 'Force dt (changes sim speed)' }
            ],
            onChange: (v) => { syntheticDt.mode = v; emit(); }
        }),
        syntheticStallMs: makeNumberSliderRow({
            label: 'Stall ms (when pattern stalls)',
            value: syntheticDt.stallMs ?? 34,
            min: 0,
            max: 120,
            step: 1,
            digits: 0,
            onChange: (v) => { syntheticDt.stallMs = v; emit(); }
        }),
        syntheticPattern: makeSelectRow({
            label: 'Synthetic dt pattern',
            value: String(syntheticDt.pattern ?? 'off'),
            options: [
                { id: 'off', label: 'Off' },
                { id: 'steady20', label: 'Steady 20 FPS (dt=0.05)' },
                { id: 'steady30', label: 'Steady 30 FPS (dt=1/30)' },
                { id: 'alt60_20', label: 'Alternate 60/20 FPS' },
                { id: 'alt60_30', label: 'Alternate 60/30 FPS' },
                { id: 'alt60_40', label: 'Alternate 60/40 FPS' },
                { id: 'spike20', label: 'Mostly 60 FPS, spike 20 FPS' }
            ],
            onChange: (v) => {
                syntheticDt.pattern = v;
                syntheticDt.enabled = v !== 'off';
                emit();
                syncSynthetic();
            }
        })
    };

    const syncSynthetic = () => {
        const on = dbg.enabled === true && syntheticDt.enabled === true;
        controls.syntheticPattern.select.disabled = !on;
        controls.syntheticMode.select.disabled = !on;
        controls.syntheticStallMs.range.disabled = !on;
        controls.syntheticStallMs.number.disabled = !on;
    };
    syncSynthetic();
    controls.enabled.toggle.addEventListener('change', () => syncSynthetic());

    sectionVehicle.appendChild(controls.enabled.row);
    sectionVehicle.appendChild(controls.freezeCamera.row);
    sectionVehicle.appendChild(controls.overlay.row);
    sectionVehicle.appendChild(controls.logSpikes.row);
    sectionVehicle.appendChild(controls.logCatchup.row);
    sectionVehicle.appendChild(controls.logLag.row);
    sectionVehicle.appendChild(controls.logCameraEvents.row);
    sectionVehicle.appendChild(controls.logCameraTargetMismatch.row);
    sectionVehicle.appendChild(controls.logMinScreenPx.row);
    sectionVehicle.appendChild(controls.backStep.row);
    sectionVehicle.appendChild(controls.catchupDfwd.row);
    sectionVehicle.appendChild(controls.catchupCamMove.row);
    sectionVehicle.appendChild(controls.catchupDistDrop.row);
    sectionVehicle.appendChild(controls.lagBusStep.row);
    sectionVehicle.appendChild(controls.lagRatio.row);
    sectionVehicle.appendChild(controls.targetMatrixErr.row);
    sectionVehicle.appendChild(controls.maxDist.row);
    sectionVehicle.appendChild(controls.maxYaw.row);
    sectionVehicle.appendChild(controls.maxScreen.row);
    sectionVehicle.appendChild(controls.syntheticEnabled.row);
    sectionVehicle.appendChild(controls.syntheticMode.row);
    sectionVehicle.appendChild(controls.syntheticStallMs.row);
    sectionVehicle.appendChild(controls.syntheticPattern.row);

    const sectionReadouts = makeEl('div', 'options-section');
    sectionReadouts.appendChild(makeEl('div', 'options-section-title', 'Readouts'));
    const r = {
        dt: makeValueRow({ label: 'Render dt', value: '-' }),
        fps: makeValueRow({ label: 'Estimated FPS', value: '-' }),
        rawDt: makeValueRow({ label: 'Raw dt (pre-clamp)', value: '-' }),
        synthetic: makeValueRow({ label: 'Synthetic dt pattern', value: '-' }),
        fixedDt: makeValueRow({ label: 'Physics fixedDt', value: '-' }),
        subSteps: makeValueRow({ label: 'Physics substeps', value: '-' }),
        alpha: makeValueRow({ label: 'Physics alpha', value: '-' }),
        anchorPos: makeValueRow({ label: 'Bus anchor (world)', value: '-' }),
        anchorYaw: makeValueRow({ label: 'Bus yaw (world)', value: '-' }),
        locoPos: makeValueRow({ label: 'Physics locomotion pos', value: '-' }),
        locoSpeed: makeValueRow({ label: 'Physics speed', value: '-' }),
        posErr: makeValueRow({ label: 'Render vs physics posErr', value: '-' }),
        yawErr: makeValueRow({ label: 'Render vs physics yawErr', value: '-' }),
        screenPos: makeValueRow({ label: 'Bus screen pos (px)', value: '-' })
    };
    for (const row of Object.values(r)) sectionReadouts.appendChild(row.row);

    this._vehicleDebugEls = {
        dt: r.dt.text,
        fps: r.fps.text,
        rawDt: r.rawDt.text,
        synthetic: r.synthetic.text,
        fixedDt: r.fixedDt.text,
        subSteps: r.subSteps.text,
        alpha: r.alpha.text,
        anchorPos: r.anchorPos.text,
        anchorYaw: r.anchorYaw.text,
        locoPos: r.locoPos.text,
        locoSpeed: r.locoSpeed.text,
        posErr: r.posErr.text,
        yawErr: r.yawErr.text,
        screenPos: r.screenPos.text
    };

    const note = makeEl('div', 'options-note');
    note.textContent = 'Debug tab is gated by URL params: ?debug=true (or ?debugOptions=true). Synthetic mode "Stall" simulates frame-time spikes without changing simulation speed.';

    this.body.appendChild(sectionVehicle);
    this.body.appendChild(sectionReadouts);
    this.body.appendChild(note);

    this._refreshVehicleMotionDebug();
}

