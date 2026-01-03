// src/graphics/gui/rapier_debugger/RapierDebuggerUI.js
const INPUT_HELP = {
    engineForce: 'Sets the forward force applied by the wheel on the chassis. Start around 8000-20000 for this scale.',
    brakeForce: 'Sets the maximum braking impulse applied by the wheel to slow down the vehicle. Use similar order as engine force.',
    handbrakeForce: 'Extra rear-wheel braking impulse. Often 0.5x to 1.2x brake force.',
    steerAngle: 'Sets the steering angle (radians) for the wheel. Typical +/-0.2 to 0.6.',
    bodyType: 'Rigid-body type: dynamic reacts to forces, fixed is immovable, kinematic is user-driven.',
    translation: 'Rigid-body translation in world space (meters).',
    rotation: 'Rigid-body rotation as a unit quaternion.',
    linvel: 'Initial linear velocity (m/s).',
    angvel: 'Initial angular velocity (axis times rad/s).',
    worldGravity: 'World gravity vector (m/s^2). Default is 0, -9.81, 0.',
    gravityScale: 'Scales gravity for this body (0 disables, negative flips). Typical 0.5 to 2.',
    canSleep: 'Allow this body to sleep when it becomes idle.',
    ccdEnabled: 'Enable continuous collision detection to reduce tunneling.',
    dominanceGroup: 'Dominance group [-127, 127]. Keep small values like -1, 0, 1.',
    lockTranslations: 'Lock translations along all axes.',
    lockRotations: 'Lock rotations along all axes.',
    enabledRotations: 'Enable rotation per axis (X/Y/Z).',
    force: 'Persistent force added to the body. Scale with mass.',
    forcePoint: 'World point for applying a force.',
    torque: 'Persistent torque added to the body. Scale with mass and size.',
    impulse: 'Instantaneous impulse applied to the body. Scale with mass.',
    impulsePoint: 'World point for applying an impulse.',
    torqueImpulse: 'Instantaneous torque impulse. Scale with mass and size.',
    spawnHeight: 'Initial translation Y when spawning or resetting.',
    groundClearance: 'Ride height before suspension. Often 0.2-0.4 of wheel radius.',
    wheelSideInset: 'Wheel side offset from chassis side. Positive widens track. Zero keeps wheel outer face flush; typical 0-0.2x wheel width.',
    restLength: 'Sets the rest length of the wheel suspension spring. Often 0.3-0.6 of wheel radius.',
    wheelbaseRatio: 'Wheel Z position as a fraction of chassis length. Typical 0.6-0.75.',
    additionalMass: 'Additional mass before collider contributions. Use tens of percent steps.',
    linearDamping: 'Linear damping coefficient. Typical 0 to 1.',
    angularDamping: 'Angular damping coefficient. Typical 0 to 2.',
    massPropsMass: 'Overrides additional mass when full mass properties are set.',
    massPropsComX: 'Additional mass properties center of mass X (local chassis space).',
    massPropsComY: 'Additional mass properties center of mass Y (local chassis space).',
    massPropsComZ: 'Additional mass properties center of mass Z (local chassis space).',
    massPropsInertiaX: 'Principal inertia X. Roughly mass * size^2.',
    massPropsInertiaY: 'Principal inertia Y. Roughly mass * size^2.',
    massPropsInertiaZ: 'Principal inertia Z. Roughly mass * size^2.',
    massPropsFrameW: 'Inertia frame W. Keep quaternion normalized.',
    massPropsFrameX: 'Inertia frame X. Keep quaternion normalized.',
    massPropsFrameY: 'Inertia frame Y. Keep quaternion normalized.',
    massPropsFrameZ: 'Inertia frame Z. Keep quaternion normalized.',
    suspMaxTravel: 'Sets the maximum distance the suspension can travel before and after its resting length. Typical 0.1-0.3.',
    suspStiffness: 'Sets the wheel suspension stiffness. Higher is firmer. 20000-60000 typical here.',
    suspCompression: 'Wheel suspension damping when being compressed. 2000-6000 typical here.',
    suspRelaxation: 'Wheel suspension damping when being released. 2000-6000 typical here.',
    suspMaxForce: 'Sets the maximum force applied by the wheel suspension. 60000-120000 typical here.',
    tireFrictionSlip: 'Sets the parameter controlling how much traction the tire has. Typical 6-10.',
    tireSideStiffness: 'Multiplier of friction between the tire and the collider it is on top of. Typical 1-2.'
};

const OUTPUT_HELP = {
    status: 'Simulation status from the physics step.',
    speed: 'Controller speed along vehicle forward axis.',
    speedKph: 'Controller speed in km/h.',
    speedProj: 'Projected speed along world forward.',
    yaw: 'Yaw angle in degrees.',
    axes: 'Vehicle controller axis indices.',
    mass: 'Computed rigid-body mass.',
    position: 'Rigid-body position in world space (m).',
    rotation: 'Rigid-body rotation quaternion.',
    linvel: 'Rigid-body linear velocity (m/s).',
    angvel: 'Rigid-body angular velocity (rad/s).',
    contacts: 'wheelIsInContact for each wheel. Dots are FL, FR, RL, RR (front to rear, left to right).',
    rayDown: 'Ray cast down hit and time of impact.',
    counts: 'Rigid-body and collider counts.',
    wheels: 'Per-wheel: contact uses wheelIsInContact, steer uses wheelSteering (rad), suspension length/force use wheelSuspensionLength and wheelSuspensionForce, impulses use wheelForwardImpulse and wheelSideImpulse. Connect L is wheelChassisConnectionPointCs (chassis space).'
};

function formatNum(value, digits = 2) {
    if (!Number.isFinite(value)) return 'n/a';
    return value.toFixed(digits);
}

function padLeft(str, width) {
    if (str.length >= width) return str;
    return `${' '.repeat(width - str.length)}${str}`;
}

function outNum(value, digits = 2, width = 8) {
    if (!Number.isFinite(value)) return padLeft('n/a', width);
    const normalized = Math.abs(value) < 1e-9 ? 0 : value;
    return padLeft(normalized.toFixed(digits), width);
}

function outVec3(v, digits = 2, width = 8) {
    if (!v) return `${outNum(NaN, digits, width)}, ${outNum(NaN, digits, width)}, ${outNum(NaN, digits, width)}`;
    return `${outNum(v.x, digits, width)}, ${outNum(v.y, digits, width)}, ${outNum(v.z, digits, width)}`;
}

function qNum(value, digits = 3) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function packVec3(v, digits = 3) {
    return [qNum(v?.x, digits), qNum(v?.y, digits), qNum(v?.z, digits)];
}

function packQuat(q, digits = 4) {
    return [qNum(q?.x, digits), qNum(q?.y, digits), qNum(q?.z, digits), qNum(q?.w, digits)];
}

function formatVec3(v, digits = 2) {
    if (!v) return 'n/a';
    return `${formatNum(v.x, digits)}, ${formatNum(v.y, digits)}, ${formatNum(v.z, digits)}`;
}

function makeHudRoot() {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.pointerEvents = 'none';
    root.style.display = 'flex';
    root.style.flexWrap = 'wrap';
    root.style.justifyContent = 'space-between';
    root.style.alignItems = 'flex-start';
    root.style.alignContent = 'flex-start';
    root.style.padding = '16px';
    root.style.gap = '16px';
    root.style.zIndex = '60';
    return root;
}

function stylePanel(el, { interactive = false } = {}) {
    el.style.pointerEvents = interactive ? 'auto' : 'none';
    el.style.userSelect = 'none';
    el.style.minWidth = '280px';
    el.style.maxWidth = '440px';
    el.style.boxSizing = 'border-box';
    el.style.background = 'rgba(10, 14, 20, 0.55)';
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.borderRadius = '14px';
    el.style.padding = '12px 14px';
    el.style.color = '#e9f2ff';
    el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial';
    el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.35)';
}

function makeTitle(text) {
    const t = document.createElement('div');
    t.textContent = text;
    t.style.fontWeight = '800';
    t.style.fontSize = '14px';
    t.style.letterSpacing = '0.6px';
    t.style.textTransform = 'uppercase';
    t.style.opacity = '0.92';
    t.style.marginBottom = '10px';
    return t;
}

function makeLabel(text) {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.fontSize = '12px';
    l.style.fontWeight = '800';
    l.style.opacity = '0.85';
    l.style.marginTop = '10px';
    l.style.marginBottom = '6px';
    l.style.textTransform = 'uppercase';
    l.style.letterSpacing = '0.4px';
    return l;
}

function makeSeparator() {
    const hr = document.createElement('div');
    hr.style.height = '1px';
    hr.style.margin = '10px 0';
    hr.style.background = 'rgba(255,255,255,0.10)';
    return hr;
}

function makeGroup(title, { tightTop = false } = {}) {
    const wrap = document.createElement('div');
    const label = makeLabel(title);
    if (tightTop) {
        label.style.marginTop = '0';
    }
    const body = document.createElement('div');
    wrap.appendChild(label);
    wrap.appendChild(body);
    return { wrap, body };
}

function appendHelp(labelEl, helpText, helpSystem) {
    if (!helpText || !helpSystem) return;
    const help = document.createElement('span');
    help.textContent = '?';
    help.style.display = 'inline-flex';
    help.style.alignItems = 'center';
    help.style.justifyContent = 'center';
    help.style.width = '16px';
    help.style.height = '16px';
    help.style.marginLeft = '6px';
    help.style.borderRadius = '999px';
    help.style.border = '1px solid rgba(255,255,255,0.35)';
    help.style.fontSize = '11px';
    help.style.fontWeight = '700';
    help.style.opacity = '0.85';
    help.style.cursor = 'default';
    help.style.pointerEvents = 'auto';
    help.addEventListener('mouseenter', (e) => helpSystem.show(helpText, e));
    help.addEventListener('mousemove', (e) => helpSystem.move(e));
    help.addEventListener('mouseleave', () => helpSystem.hide());
    labelEl.appendChild(help);
}

function makeRangeControl({ title, min, max, step, value, fmt, help, helpSystem }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'baseline';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    appendHelp(label, help, helpSystem);

    const val = document.createElement('div');
    val.style.fontSize = '12px';
    val.style.opacity = '0.75';
    val.textContent = fmt(value);

    head.appendChild(label);
    head.appendChild(val);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = '100%';
    input.style.marginTop = '6px';

    wrap.appendChild(head);
    wrap.appendChild(input);

    return { wrap, input, valEl: val, fmt };
}

function makeKnobControl({ title, min, max, step, value, fmt, help, helpSystem }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.alignItems = 'baseline';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    appendHelp(label, help, helpSystem);

    const val = document.createElement('div');
    val.style.fontSize = '12px';
    val.style.opacity = '0.75';
    val.textContent = fmt(value);

    head.appendChild(label);
    head.appendChild(val);

    const track = document.createElement('div');
    track.style.position = 'relative';
    track.style.height = '18px';
    track.style.marginTop = '6px';

    const line = document.createElement('div');
    line.style.position = 'absolute';
    line.style.left = '6px';
    line.style.right = '6px';
    line.style.top = '50%';
    line.style.height = '2px';
    line.style.transform = 'translateY(-50%)';
    line.style.background = 'rgba(255,255,255,0.3)';
    track.appendChild(line);

    const knob = document.createElement('div');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.width = '12px';
    knob.style.height = '12px';
    knob.style.borderRadius = '999px';
    knob.style.background = '#e9f2ff';
    knob.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.25)';
    knob.style.transform = 'translate(-50%, -50%)';
    track.appendChild(knob);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.position = 'absolute';
    input.style.inset = '0';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.opacity = '0';
    input.style.cursor = 'pointer';
    track.appendChild(input);

    const update = (next) => {
        const span = max - min;
        const t = span !== 0 ? (next - min) / span : 0;
        const clamped = Math.min(1, Math.max(0, t));
        knob.style.left = `${clamped * 100}%`;
        val.textContent = fmt(next);
    };

    update(value);

    wrap.appendChild(head);
    wrap.appendChild(track);

    return { wrap, input, valEl: val, fmt, update };
}

function makeNumberControl({ title, value, help, helpSystem, width = '120px', min = null, max = null, step = null }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    appendHelp(label, help, helpSystem);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = Number.isFinite(value) ? String(value) : '';
    input.inputMode = 'decimal';
    if (min !== null) input.min = String(min);
    if (max !== null) input.max = String(max);
    if (step !== null) input.step = String(step);
    input.style.width = width;
    input.style.padding = '4px 6px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid rgba(255,255,255,0.16)';
    input.style.background = 'rgba(8, 12, 18, 0.6)';
    input.style.color = '#e9f2ff';
    input.style.fontWeight = '600';

    row.appendChild(label);
    row.appendChild(input);

    wrap.appendChild(row);

    return { wrap, input, valEl: null };
}

function makeInlineVector3Control({
    title,
    values,
    help,
    helpSystem,
    width = '76px',
    min = null,
    max = null,
    step = null
}) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.marginBottom = '6px';
    appendHelp(label, help, helpSystem);
    wrap.appendChild(label);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';

    const makeAxis = (axis) => {
        const axisWrap = document.createElement('div');
        axisWrap.style.display = 'flex';
        axisWrap.style.alignItems = 'center';
        axisWrap.style.gap = '6px';

        const axisLabel = document.createElement('div');
        axisLabel.textContent = axis.toUpperCase();
        axisLabel.style.fontSize = '11px';
        axisLabel.style.fontWeight = '700';
        axisLabel.style.opacity = '0.8';

        const input = document.createElement('input');
        input.type = 'number';
        input.value = Number.isFinite(values?.[axis]) ? String(values[axis]) : '';
        input.inputMode = 'decimal';
        if (min !== null) input.min = String(min);
        if (max !== null) input.max = String(max);
        if (step !== null) input.step = String(step);
        input.style.width = width;
        input.style.padding = '4px 6px';
        input.style.borderRadius = '8px';
        input.style.border = '1px solid rgba(255,255,255,0.16)';
        input.style.background = 'rgba(8, 12, 18, 0.6)';
        input.style.color = '#e9f2ff';
        input.style.fontWeight = '600';

        axisWrap.appendChild(axisLabel);
        axisWrap.appendChild(input);
        row.appendChild(axisWrap);
        return input;
    };

    const inputX = makeAxis('x');
    const inputY = makeAxis('y');
    const inputZ = makeAxis('z');

    wrap.appendChild(row);
    return { wrap, inputs: { x: inputX, y: inputY, z: inputZ } };
}

function makeToggleControl({ title, value, help, helpSystem }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    appendHelp(label, help, helpSystem);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.style.width = '16px';
    input.style.height = '16px';
    input.style.cursor = 'pointer';

    row.appendChild(label);
    row.appendChild(input);
    wrap.appendChild(row);

    return { wrap, input, valEl: null };
}

function makeSelectControl({ title, value, options = [], help, helpSystem }) {
    const wrap = document.createElement('div');
    wrap.style.margin = '8px 0 10px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontSize = '13px';
    label.style.fontWeight = '700';
    label.style.opacity = '0.95';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    appendHelp(label, help, helpSystem);

    const select = document.createElement('select');
    select.style.width = '180px';
    select.style.padding = '4px 6px';
    select.style.borderRadius = '8px';
    select.style.border = '1px solid rgba(255,255,255,0.16)';
    select.style.background = 'rgba(8, 12, 18, 0.6)';
    select.style.color = '#e9f2ff';
    select.style.fontWeight = '600';

    for (const opt of options) {
        const option = document.createElement('option');
        option.value = String(opt.value);
        option.textContent = String(opt.label);
        select.appendChild(option);
    }
    if (value !== undefined && value !== null) {
        select.value = String(value);
    }

    row.appendChild(label);
    row.appendChild(select);
    wrap.appendChild(row);

    return { wrap, input: select, valEl: null };
}

function makeValueRow(label, { help = null, helpSystem = null, bar = false, arrow = false, dots = 0 } = {}) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '10px';
    row.style.margin = '6px 0';

    const key = document.createElement('div');
    key.textContent = label;
    key.style.fontSize = '12px';
    key.style.fontWeight = '700';
    key.style.opacity = '0.85';
    key.style.whiteSpace = 'pre-line';
    appendHelp(key, help, helpSystem);

    const value = document.createElement('div');
    value.textContent = 'n/a';
    value.style.fontSize = '12px';
    value.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    value.style.fontVariantNumeric = 'tabular-nums';
    value.style.whiteSpace = 'pre';
    value.style.textAlign = 'right';
    value.style.opacity = '0.9';

    const valueWrap = document.createElement('div');
    valueWrap.style.display = 'flex';
    valueWrap.style.flexDirection = 'column';
    valueWrap.style.alignItems = 'flex-end';
    valueWrap.style.gap = '4px';

    const valueLine = document.createElement('div');
    valueLine.style.display = 'flex';
    valueLine.style.alignItems = 'center';
    valueLine.style.gap = '6px';

    let arrowEl = null;
    if (arrow) {
        arrowEl = makeArrowMarker({ size: 14, color: 'rgba(233, 242, 255, 0.9)' });
        valueLine.appendChild(arrowEl);
    }

    valueLine.appendChild(value);
    valueWrap.appendChild(valueLine);

    let barFill = null;
    if (bar) {
        const barWrap = document.createElement('div');
        barWrap.style.width = '120px';
        barWrap.style.height = '6px';
        barWrap.style.borderRadius = '999px';
        barWrap.style.background = 'rgba(255,255,255,0.15)';
        barWrap.style.overflow = 'hidden';

        barFill = document.createElement('div');
        barFill.style.height = '100%';
        barFill.style.width = '0%';
        barFill.style.background = 'rgba(76,255,122,0.85)';
        barWrap.appendChild(barFill);
        valueWrap.appendChild(barWrap);
    }

    let dotEls = null;
    if (dots > 0) {
        const dotWrap = document.createElement('div');
        dotWrap.style.display = 'flex';
        dotWrap.style.alignItems = 'center';
        dotWrap.style.gap = '6px';

        dotEls = [];
        for (let i = 0; i < dots; i++) {
            const dot = document.createElement('div');
            dot.style.width = '8px';
            dot.style.height = '8px';
            dot.style.borderRadius = '999px';
            dot.style.background = 'rgba(255,255,255,0.2)';
            dot.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.15)';
            dotWrap.appendChild(dot);
            dotEls.push(dot);
        }
        valueWrap.appendChild(dotWrap);
    }

    row.appendChild(key);
    row.appendChild(valueWrap);
    return { row, valueEl: value, barEl: barFill, arrowEl, dotEls };
}

function makeArrowMarker({ size = 14, color = 'rgba(233, 242, 255, 0.9)' } = {}) {
    const arrow = document.createElement('div');
    const headWidth = Math.max(6, Math.round(size * 0.6));
    const headHeight = Math.max(6, Math.round(size * 0.5));
    const shaftWidth = Math.max(2, Math.round(size * 0.15));
    const shaftHeight = Math.max(4, size - headHeight - 2);

    arrow.style.position = 'relative';
    arrow.style.width = `${size}px`;
    arrow.style.height = `${size}px`;
    arrow.style.transform = 'rotate(0deg)';
    arrow.style.transformOrigin = '50% 50%';

    const head = document.createElement('div');
    head.style.position = 'absolute';
    head.style.left = '50%';
    head.style.top = '0';
    head.style.width = '0';
    head.style.height = '0';
    head.style.borderLeft = `${Math.round(headWidth / 2)}px solid transparent`;
    head.style.borderRight = `${Math.round(headWidth / 2)}px solid transparent`;
    head.style.borderBottom = `${headHeight}px solid ${color}`;
    head.style.transform = 'translateX(-50%)';

    const shaft = document.createElement('div');
    shaft.style.position = 'absolute';
    shaft.style.left = '50%';
    shaft.style.top = `${headHeight - 1}px`;
    shaft.style.width = `${shaftWidth}px`;
    shaft.style.height = `${shaftHeight}px`;
    shaft.style.background = color;
    shaft.style.borderRadius = '999px';
    shaft.style.transform = 'translateX(-50%)';

    arrow.appendChild(shaft);
    arrow.appendChild(head);
    return arrow;
}

function makeButton(label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(255,255,255,0.16)';
    btn.style.background = 'rgba(12, 16, 24, 0.9)';
    btn.style.color = '#e9f2ff';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.marginRight = '8px';
    return btn;
}

const PRESET_TESTS = [
    {
        id: 'straight_brake',
        label: 'Test 1: Throttle + Brake',
        steps: [
            { duration: 1.2, input: { engineForce: 8000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 3.6, input: { engineForce: 14000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 2.0, input: { engineForce: 0, brakeForce: 12000, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 1.2, input: { engineForce: 0, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } }
        ]
    },
    {
        id: 'steer_sweep',
        label: 'Test 2: Steer Sweep',
        steps: [
            { duration: 1.6, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0 } },
            { duration: 2.4, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.35 } },
            { duration: 2.4, input: { engineForce: 9000, brakeForce: 0, handbrakeForce: 0, steerAngle: -0.35 } },
            { duration: 1.6, input: { engineForce: 0, brakeForce: 10000, handbrakeForce: 0, steerAngle: 0 } }
        ]
    },
    {
        id: 'handbrake_turn',
        label: 'Test 3: Handbrake Turn',
        steps: [
            { duration: 1.6, input: { engineForce: 10000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.25 } },
            { duration: 1.8, input: { engineForce: 10000, brakeForce: 0, handbrakeForce: 0, steerAngle: 0.45 } },
            { duration: 1.6, input: { engineForce: 0, brakeForce: 0, handbrakeForce: 14000, steerAngle: 0.45 } },
            { duration: 1.6, input: { engineForce: 0, brakeForce: 9000, handbrakeForce: 0, steerAngle: 0 } }
        ]
    }
];

export class RapierDebuggerUI {
    constructor({ vehicleConfig = null, tuning = null, worldConfig = null } = {}) {
        this._hudRoot = null;
        this._inputPanel = null;
        this._outputPanel = null;
        this._helpTooltip = null;
        this._helpSystem = null;

        this._inputControls = {};
        this._outputRows = {};
        this._wheelCells = null;
        this._testButtons = [];
        this._actionButtons = [];
        this._statusText = null;
        this._copyButton = null;
        this._recordButton = null;

        this._enabled = false;
        this._inputs = {
            engineForce: 0,
            brakeForce: 0,
            handbrakeForce: 0,
            steerAngle: 0
        };

        const baseWorldConfig = worldConfig ?? {};
        const baseGravity = baseWorldConfig.gravity ?? {};
        this._worldConfig = {
            gravity: {
                x: Number.isFinite(baseGravity.x) ? baseGravity.x : 0,
                y: Number.isFinite(baseGravity.y) ? baseGravity.y : -9.81,
                z: Number.isFinite(baseGravity.z) ? baseGravity.z : 0
            }
        };

        this._forces = {
            force: { x: 0, y: 0, z: 0 },
            forcePoint: { x: 0, y: 0, z: 0 },
            torque: { x: 0, y: 0, z: 0 },
            impulse: { x: 0, y: 0, z: 0 },
            impulsePoint: { x: 0, y: 0, z: 0 },
            torqueImpulse: { x: 0, y: 0, z: 0 }
        };

        const baseVehicleConfig = vehicleConfig ?? {};
        this._vehicleConfig = {
            spawnHeight: Number.isFinite(baseVehicleConfig.spawnHeight) ? baseVehicleConfig.spawnHeight : 3,
            groundClearance: Number.isFinite(baseVehicleConfig.groundClearance) ? baseVehicleConfig.groundClearance : 0.24,
            restLength: Number.isFinite(baseVehicleConfig.restLength) ? baseVehicleConfig.restLength : 0.35,
            wheelbaseRatio: Number.isFinite(baseVehicleConfig.wheelbaseRatio) ? baseVehicleConfig.wheelbaseRatio : 0.65,
            wheelSideInset: Number.isFinite(baseVehicleConfig.wheelSideInset) ? baseVehicleConfig.wheelSideInset : 0.08
        };

        const baseTuning = tuning ?? {};
        const baseChassis = baseTuning.chassis ?? {};
        const baseProps = baseChassis.additionalMassProperties ?? {};
        const baseCom = baseProps.com ?? {};
        const baseInertia = baseProps.inertia ?? {};
        const baseFrame = baseProps.inertiaFrame ?? {};
        const baseTranslation = baseChassis.translation ?? {};
        const baseRotation = baseChassis.rotation ?? {};
        const baseLinvel = baseChassis.linvel ?? {};
        const baseAngvel = baseChassis.angvel ?? {};
        const baseEnabledRotations = baseChassis.enabledRotations ?? {};
        const spawnHeight = this._vehicleConfig.spawnHeight;
        this._tuning = {
            chassis: {
                bodyType: typeof baseChassis.bodyType === 'string' ? baseChassis.bodyType : 'dynamic',
                translation: {
                    x: Number.isFinite(baseTranslation.x) ? baseTranslation.x : 0,
                    y: Number.isFinite(baseTranslation.y) ? baseTranslation.y : spawnHeight,
                    z: Number.isFinite(baseTranslation.z) ? baseTranslation.z : 0
                },
                rotation: {
                    x: Number.isFinite(baseRotation.x) ? baseRotation.x : 0,
                    y: Number.isFinite(baseRotation.y) ? baseRotation.y : 0,
                    z: Number.isFinite(baseRotation.z) ? baseRotation.z : 0,
                    w: Number.isFinite(baseRotation.w) ? baseRotation.w : 1
                },
                linvel: {
                    x: Number.isFinite(baseLinvel.x) ? baseLinvel.x : 0,
                    y: Number.isFinite(baseLinvel.y) ? baseLinvel.y : 0,
                    z: Number.isFinite(baseLinvel.z) ? baseLinvel.z : 0
                },
                angvel: {
                    x: Number.isFinite(baseAngvel.x) ? baseAngvel.x : 0,
                    y: Number.isFinite(baseAngvel.y) ? baseAngvel.y : 0,
                    z: Number.isFinite(baseAngvel.z) ? baseAngvel.z : 0
                },
                additionalMass: Number.isFinite(baseChassis.additionalMass) ? baseChassis.additionalMass : 6500,
                linearDamping: Number.isFinite(baseChassis.linearDamping) ? baseChassis.linearDamping : 0.32,
                angularDamping: Number.isFinite(baseChassis.angularDamping) ? baseChassis.angularDamping : 1.0,
                gravityScale: Number.isFinite(baseChassis.gravityScale) ? baseChassis.gravityScale : 1.0,
                canSleep: typeof baseChassis.canSleep === 'boolean' ? baseChassis.canSleep : true,
                ccdEnabled: typeof baseChassis.ccdEnabled === 'boolean' ? baseChassis.ccdEnabled : true,
                dominanceGroup: Number.isFinite(baseChassis.dominanceGroup) ? baseChassis.dominanceGroup : 0,
                lockTranslations: typeof baseChassis.lockTranslations === 'boolean' ? baseChassis.lockTranslations : false,
                lockRotations: typeof baseChassis.lockRotations === 'boolean' ? baseChassis.lockRotations : false,
                enabledRotations: {
                    x: typeof baseEnabledRotations.x === 'boolean' ? baseEnabledRotations.x : true,
                    y: typeof baseEnabledRotations.y === 'boolean' ? baseEnabledRotations.y : true,
                    z: typeof baseEnabledRotations.z === 'boolean' ? baseEnabledRotations.z : true
                },
                additionalMassProperties: {
                    mass: Number.isFinite(baseProps.mass) ? baseProps.mass : NaN,
                    com: {
                        x: Number.isFinite(baseCom.x) ? baseCom.x : 0,
                        y: Number.isFinite(baseCom.y) ? baseCom.y : 0,
                        z: Number.isFinite(baseCom.z) ? baseCom.z : 0
                    },
                    inertia: {
                        x: Number.isFinite(baseInertia.x) ? baseInertia.x : 0.3,
                        y: Number.isFinite(baseInertia.y) ? baseInertia.y : 0.2,
                        z: Number.isFinite(baseInertia.z) ? baseInertia.z : 0.1
                    },
                    inertiaFrame: {
                        w: Number.isFinite(baseFrame.w) ? baseFrame.w : 1,
                        x: Number.isFinite(baseFrame.x) ? baseFrame.x : 0,
                        y: Number.isFinite(baseFrame.y) ? baseFrame.y : 0,
                        z: Number.isFinite(baseFrame.z) ? baseFrame.z : 0
                    }
                }
            },
            suspension: {
                maxTravel: Number.isFinite(baseTuning.suspension?.maxTravel) ? baseTuning.suspension.maxTravel : 0.2,
                stiffness: Number.isFinite(baseTuning.suspension?.stiffness) ? baseTuning.suspension.stiffness : 34000,
                compression: Number.isFinite(baseTuning.suspension?.compression) ? baseTuning.suspension.compression : 4000,
                relaxation: Number.isFinite(baseTuning.suspension?.relaxation) ? baseTuning.suspension.relaxation : 4600,
                maxForce: Number.isFinite(baseTuning.suspension?.maxForce) ? baseTuning.suspension.maxForce : 95000
            },
            tires: {
                frictionSlip: Number.isFinite(baseTuning.tires?.frictionSlip) ? baseTuning.tires.frictionSlip : 8.2,
                sideFrictionStiffness: Number.isFinite(baseTuning.tires?.sideFrictionStiffness) ? baseTuning.tires.sideFrictionStiffness : 1.45
            }
        };

        this.onReset = null;
        this.onWheelHover = null;
        this.onAddForce = null;
        this.onAddForceAtPoint = null;
        this.onAddTorque = null;
        this.onResetForces = null;
        this.onResetTorques = null;
        this.onApplyImpulse = null;
        this.onApplyImpulseAtPoint = null;
        this.onApplyTorqueImpulse = null;
        this.onWakeUp = null;

        this._activeTest = null;
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._telemetry = null;
        this._telemetryMeta = null;
        this._sampleRecording = false;
        this._sampleElapsed = 0;
        this._sampleFrames = null;
        this._sampleConfig = null;
    }

    mount() {
        if (this._hudRoot) return;
        this._buildHud();
        this.setEnabled(false);
    }

    unmount() {
        if (this._hudRoot?.parentElement) {
            this._hudRoot.parentElement.removeChild(this._hudRoot);
        }
        this._hudRoot = null;
        this._inputPanel = null;
        this._outputPanel = null;
        this._inputControls = {};
        this._outputRows = {};
        this._wheelCells = null;
        this._testButtons = [];
        this._actionButtons = [];
        this._statusText = null;
        this._copyButton = null;
        this._recordButton = null;
        this._helpTooltip = null;
        this._helpSystem = null;
        this._activeTest = null;
        this._telemetry = null;
        this._telemetryMeta = null;
        this._sampleRecording = false;
        this._sampleElapsed = 0;
        this._sampleFrames = null;
        this._sampleConfig = null;
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        for (const control of Object.values(this._inputControls)) {
            control.input.disabled = !this._enabled || !!this._activeTest;
        }
        for (const btn of this._testButtons) {
            btn.disabled = !this._enabled || !!this._activeTest;
        }
        for (const btn of this._actionButtons) {
            btn.disabled = !this._enabled || !!this._activeTest;
        }
        if (this._recordButton) {
            this._recordButton.disabled = !this._enabled || !!this._activeTest || this._sampleRecording;
        }
        if (this._statusText && !this._activeTest) {
            this._statusText.textContent = enabled ? 'Ready' : 'Loading…';
        }
    }

    getInputs() {
        return { ...this._inputs };
    }

    getVehicleConfig() {
        return { ...this._vehicleConfig };
    }

    getTuning() {
        return {
            chassis: {
                ...this._tuning.chassis,
                translation: { ...(this._tuning.chassis.translation ?? {}) },
                rotation: { ...(this._tuning.chassis.rotation ?? {}) },
                linvel: { ...(this._tuning.chassis.linvel ?? {}) },
                angvel: { ...(this._tuning.chassis.angvel ?? {}) },
                enabledRotations: { ...(this._tuning.chassis.enabledRotations ?? {}) },
                additionalMassProperties: {
                    mass: this._tuning.chassis.additionalMassProperties?.mass ?? NaN,
                    com: { ...(this._tuning.chassis.additionalMassProperties?.com ?? {}) },
                    inertia: { ...(this._tuning.chassis.additionalMassProperties?.inertia ?? {}) },
                    inertiaFrame: { ...(this._tuning.chassis.additionalMassProperties?.inertiaFrame ?? {}) }
                }
            },
            suspension: { ...this._tuning.suspension },
            tires: { ...this._tuning.tires }
        };
    }

    getWorldConfig() {
        return {
            gravity: {
                x: this._worldConfig.gravity?.x ?? 0,
                y: this._worldConfig.gravity?.y ?? -9.81,
                z: this._worldConfig.gravity?.z ?? 0
            }
        };
    }

    update(dt, snapshot) {
        const clampedDt = Math.min(Math.max(dt ?? 0, 0), 0.05);
        if (this._activeTest) {
            this._advanceTest(clampedDt);
            if (snapshot) this._recordTelemetry(snapshot);
        }
        if (this._sampleRecording) {
            if (clampedDt > 0) this._sampleElapsed += clampedDt;
            if (snapshot) {
                this._recordSampleFrame(snapshot);
                if (this._sampleElapsed >= 0.5) this._finishSampleRecord();
            }
        }
    }

    setOutputs(snapshot) {
        if (!snapshot || !this._outputRows.status) return;

        this._outputRows.status.valueEl.textContent = snapshot.status ?? '—';

        const body = snapshot.body;
        const pos = body?.position;
        const rot = body?.rotation;
        const linvel = body?.linvel;
        const angvel = body?.angvel;

        const speedMps = snapshot.speedMps ?? 0;
        const speedMax = 40;
        this._outputRows.speed.valueEl.textContent = `${outNum(speedMps, 2, 8)} m/s`;
        if (this._outputRows.speed.barEl) {
            const t = Math.min(1, Math.max(0, speedMps / speedMax));
            this._outputRows.speed.barEl.style.width = `${Math.round(t * 100)}%`;
        }
        this._outputRows.speedKph.valueEl.textContent = `${outNum(speedMps * 3.6, 1, 8)} km/h`;
        if (this._outputRows.speedProj) {
            const sp = snapshot.speedProjMps ?? 0;
            this._outputRows.speedProj.valueEl.textContent = `${outNum(sp, 2, 8)} m/s (${outNum(sp * 3.6, 1, 8)} km/h)`;
            if (this._outputRows.speedProj.barEl) {
                const t = Math.min(1, Math.max(0, sp / speedMax));
                this._outputRows.speedProj.barEl.style.width = `${Math.round(t * 100)}%`;
            }
        }
        const yawDeg = (snapshot.yawRad ?? 0) * (180 / Math.PI);
        this._outputRows.yaw.valueEl.textContent = `${outNum(yawDeg, 1, 8)} deg`;
        if (this._outputRows.yaw.arrowEl) {
            this._outputRows.yaw.arrowEl.style.transform = `rotate(${yawDeg}deg)`;
        }
        if (this._outputRows.axes) {
            const axes = snapshot.controllerAxes ?? {};
            const up = Number.isFinite(axes.up) ? axes.up : 'n/a';
            const fwd = Number.isFinite(axes.forward) ? axes.forward : 'n/a';
            this._outputRows.axes.valueEl.textContent = `up:${padLeft(String(up), 2)}  fwd:${padLeft(String(fwd), 2)}`;
        }
        if (this._outputRows.mass) {
            this._outputRows.mass.valueEl.textContent = Number.isFinite(snapshot.massKg) ? `${outNum(snapshot.massKg, 0, 8)} kg` : `${outNum(NaN, 0, 8)} kg`;
        }
        this._outputRows.position.valueEl.textContent = outVec3(pos, 2, 8);
        this._outputRows.linvel.valueEl.textContent = outVec3(linvel, 2, 8);
        this._outputRows.angvel.valueEl.textContent = outVec3(angvel, 2, 8);
        this._outputRows.rotation.valueEl.textContent = rot ? `${outNum(rot.x, 3, 8)}, ${outNum(rot.y, 3, 8)}, ${outNum(rot.z, 3, 8)}` : outVec3(null, 3, 8);

        const contacts = snapshot.contacts ?? { count: 0, total: 0 };
        this._outputRows.contacts.valueEl.textContent = `${padLeft(String(contacts.count ?? 0), 2)}/${padLeft(String(contacts.total ?? 0), 2)}`;
        if (this._outputRows.contacts.dotEls) {
            const dots = this._outputRows.contacts.dotEls;
            const wheels = snapshot.wheelStates ?? [];
            const order = ['FL', 'FR', 'RL', 'RR'];
            for (let i = 0; i < dots.length; i++) {
                const label = order[i];
                const wheel = wheels.find((w) => w?.label === label);
                const on = !!wheel?.inContact;
                dots[i].style.background = on ? 'rgba(76,255,122,0.95)' : 'rgba(255,255,255,0.2)';
                dots[i].style.boxShadow = on
                    ? '0 0 0 1px rgba(76,255,122,0.6), 0 0 10px rgba(76,255,122,0.35)'
                    : '0 0 0 1px rgba(255,255,255,0.15)';
            }
        }

        if (this._outputRows.rayDown) {
            const rd = snapshot.rayDown;
            if (!rd) this._outputRows.rayDown.valueEl.textContent = '—';
            else if (rd.hit) this._outputRows.rayDown.valueEl.textContent = `hit:Y  toi:${outNum(rd.toi, 2, 7)}`;
            else this._outputRows.rayDown.valueEl.textContent = `hit:N  toi:${outNum(NaN, 2, 7)}`;
        }

        if (this._outputRows.counts) {
            const world = snapshot.world ?? {};
            this._outputRows.counts.valueEl.textContent = `bodies:${padLeft(String(world.bodies ?? '—'), 4)}  coll:${padLeft(String(world.colliders ?? '—'), 4)}`;
        }

        const wheelCells = this._wheelCells;
        const wheels = snapshot.wheelStates ?? [];
        const suspRest = this._vehicleConfig?.restLength ?? 0;
        const suspTravel = this._tuning?.suspension?.maxTravel ?? 0;
        const suspMin = Math.max(0, suspRest - suspTravel);
        const suspMax = suspRest + suspTravel;
        if (wheelCells && wheels.length) {
            const find = (label) => wheels.find((w) => w?.label === label);
            const toText = (w, fallbackLabel) => {
                if (!w) return '—';
                const contact = w.inContact ? 'Y' : 'N';
                const steerDeg = Number.isFinite(w.steering) ? w.steering * (180 / Math.PI) : NaN;
                const centerLocal = w.centerLocal ?? null;
                const connectionLocal = w.connectionPointLocal ?? null;
                return (
                    `${padLeft(String(w.label ?? fallbackLabel), 2)}  contact:${contact}\n` +
                    `steer:${outNum(steerDeg, 1, 5)} deg\n` +
                    `susp len:${outNum(w.suspensionLength, 3, 5)} m\n` +
                    `susp force:${outNum(w.suspensionForce, 0, 5)} N\n` +
                    `imp fwd:${outNum(w.forwardImpulse, 2, 5)}\n` +
                    `imp side:${outNum(w.sideImpulse, 2, 5)}\n` +
                    `centerL:${outNum(centerLocal?.x, 1, 5)} ${outNum(centerLocal?.y, 1, 5)} ${outNum(centerLocal?.z, 1, 5)}\n` +
                    `connectL:${outNum(connectionLocal?.x, 1, 5)} ${outNum(connectionLocal?.y, 1, 5)} ${outNum(connectionLocal?.z, 1, 5)}`
                );
            };

            const apply = (cell, wheel) => {
                if (!cell) return;
                if (cell.textEl) {
                    cell.textEl.textContent = toText(wheel, cell.label ?? '—');
                }
                if (cell.knobEl) {
                    const inContact = !!wheel?.inContact;
                    cell.knobEl.style.background = inContact ? '#4cff7a' : '#c8cbd1';
                    cell.knobEl.style.boxShadow = inContact
                        ? '0 0 0 2px rgba(76,255,122,0.25), 0 0 18px rgba(76,255,122,0.25)'
                        : '0 0 0 2px rgba(0,0,0,0.25)';
                    cell.knobEl.style.opacity = inContact ? '1' : '0.85';
                }
                if (cell.arrowEl) {
                    const steerDeg = Number.isFinite(wheel?.steering) ? wheel.steering * (180 / Math.PI) : 0;
                    cell.arrowEl.style.transform = `rotate(${steerDeg}deg)`;
                    cell.arrowEl.style.opacity = Number.isFinite(wheel?.steering) ? '1' : '0.2';
                }
                if (cell.barEl) {
                    const len = Number.isFinite(wheel?.suspensionLength) ? wheel.suspensionLength : suspRest;
                    const span = Math.max(1e-6, suspMax - suspMin);
                    const t = Math.min(1, Math.max(0, (len - suspMin) / span));
                    cell.barEl.style.width = `${Math.round(t * 100)}%`;
                }
            };

            apply(wheelCells.fl, find('FL'));
            apply(wheelCells.fr, find('FR'));
            apply(wheelCells.rl, find('RL'));
            apply(wheelCells.rr, find('RR'));
        }
    }

    _buildHud() {
        const root = makeHudRoot();
        const helpSystem = this._createHelpSystem(root);
        this._helpSystem = helpSystem;

        const inputPanel = document.createElement('div');
        stylePanel(inputPanel, { interactive: true });
        const inputHeader = document.createElement('div');
        inputHeader.style.display = 'flex';
        inputHeader.style.alignItems = 'center';
        inputHeader.style.justifyContent = 'space-between';
        inputHeader.style.gap = '10px';

        const inputTitle = makeTitle('Rapier Input');
        inputTitle.style.marginBottom = '0';
        inputHeader.appendChild(inputTitle);

        inputHeader.style.marginBottom = '10px';
        inputPanel.appendChild(inputHeader);
        inputPanel.style.flex = '2 1 520px';
        inputPanel.style.minWidth = '320px';
        inputPanel.style.width = 'auto';
        inputPanel.style.maxHeight = 'calc(100vh - 32px)';
        inputPanel.style.overflowY = 'auto';
        inputPanel.style.overflowX = 'hidden';

        const columns = document.createElement('div');
        columns.style.display = 'flex';
        columns.style.flexWrap = 'wrap';
        columns.style.alignItems = 'flex-start';
        columns.style.gap = '10px 16px';

        const leftCol = document.createElement('div');
        leftCol.style.display = 'flex';
        leftCol.style.flexDirection = 'column';
        leftCol.style.flex = '1.3 1 320px';

        const middleCol = document.createElement('div');
        middleCol.style.display = 'flex';
        middleCol.style.flexDirection = 'column';
        middleCol.style.flex = '1 1 280px';

        const rightCol = document.createElement('div');
        rightCol.style.display = 'flex';
        rightCol.style.flexDirection = 'column';
        rightCol.style.flex = '1 1 280px';

        const internalGroups = {
            vehicle: makeGroup('Vehicle (Live)', { tightTop: true }),
            suspension: makeGroup('Suspension (Live)'),
            tires: makeGroup('Tires (Live)'),
            bodyType: makeGroup('Rigid-body Type', { tightTop: true }),
            position: makeGroup('Position'),
            velocity: makeGroup('Velocity'),
            mass: makeGroup('Mass Properties'),
            damping: makeGroup('Damping'),
            locks: makeGroup('Locking Translations/Rotations'),
            dominance: makeGroup('Dominance'),
            ccd: makeGroup('Continuous Collision Detection'),
            sleeping: makeGroup('Sleeping')
        };

        middleCol.appendChild(internalGroups.vehicle.wrap);
        middleCol.appendChild(internalGroups.suspension.wrap);
        middleCol.appendChild(internalGroups.tires.wrap);

        rightCol.appendChild(internalGroups.position.wrap);
        rightCol.appendChild(internalGroups.velocity.wrap);
        rightCol.appendChild(internalGroups.mass.wrap);
        rightCol.appendChild(internalGroups.damping.wrap);
        rightCol.appendChild(internalGroups.locks.wrap);
        rightCol.appendChild(internalGroups.dominance.wrap);

        columns.appendChild(leftCol);
        columns.appendChild(middleCol);
        columns.appendChild(rightCol);
        inputPanel.appendChild(columns);

        this._inputControls.bodyType = makeSelectControl({
            title: 'RigidBodyType',
            value: this._tuning.chassis.bodyType,
            options: [
                { value: 'dynamic', label: 'Dynamic' },
                { value: 'fixed', label: 'Fixed' },
                { value: 'kinematicPositionBased', label: 'Kinematic (Position)' },
                { value: 'kinematicVelocityBased', label: 'Kinematic (Velocity)' }
            ],
            help: INPUT_HELP.bodyType,
            helpSystem
        });
        internalGroups.bodyType.body.appendChild(this._inputControls.bodyType.wrap);

        this._inputControls.translationX = makeNumberControl({
            title: 'Translation X (m)',
            value: this._tuning.chassis.translation.x,
            help: INPUT_HELP.translation,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.position.body.appendChild(this._inputControls.translationX.wrap);

        this._inputControls.spawnHeight = makeRangeControl({
            title: 'Translation Y (m)',
            min: 0,
            max: 20,
            step: 0.1,
            value: this._tuning.chassis.translation.y,
            fmt: (v) => formatNum(v, 1),
            help: INPUT_HELP.translation,
            helpSystem
        });
        internalGroups.position.body.appendChild(this._inputControls.spawnHeight.wrap);

        this._inputControls.translationZ = makeNumberControl({
            title: 'Translation Z (m)',
            value: this._tuning.chassis.translation.z,
            help: INPUT_HELP.translation,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.position.body.appendChild(this._inputControls.translationZ.wrap);

        this._inputControls.rotationW = makeNumberControl({
            title: 'Rotation W',
            value: this._tuning.chassis.rotation.w,
            help: INPUT_HELP.rotation,
            helpSystem,
            step: 0.01,
            width: '90px'
        });
        internalGroups.position.body.appendChild(this._inputControls.rotationW.wrap);

        this._inputControls.rotationX = makeNumberControl({
            title: 'Rotation X',
            value: this._tuning.chassis.rotation.x,
            help: INPUT_HELP.rotation,
            helpSystem,
            step: 0.01,
            width: '90px'
        });
        internalGroups.position.body.appendChild(this._inputControls.rotationX.wrap);

        this._inputControls.rotationY = makeNumberControl({
            title: 'Rotation Y',
            value: this._tuning.chassis.rotation.y,
            help: INPUT_HELP.rotation,
            helpSystem,
            step: 0.01,
            width: '90px'
        });
        internalGroups.position.body.appendChild(this._inputControls.rotationY.wrap);

        this._inputControls.rotationZ = makeNumberControl({
            title: 'Rotation Z',
            value: this._tuning.chassis.rotation.z,
            help: INPUT_HELP.rotation,
            helpSystem,
            step: 0.01,
            width: '90px'
        });
        internalGroups.position.body.appendChild(this._inputControls.rotationZ.wrap);

        this._inputControls.linvelX = makeNumberControl({
            title: 'Linvel X (m/s)',
            value: this._tuning.chassis.linvel.x,
            help: INPUT_HELP.linvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.linvelX.wrap);

        this._inputControls.linvelY = makeNumberControl({
            title: 'Linvel Y (m/s)',
            value: this._tuning.chassis.linvel.y,
            help: INPUT_HELP.linvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.linvelY.wrap);

        this._inputControls.linvelZ = makeNumberControl({
            title: 'Linvel Z (m/s)',
            value: this._tuning.chassis.linvel.z,
            help: INPUT_HELP.linvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.linvelZ.wrap);

        this._inputControls.angvelX = makeNumberControl({
            title: 'Angvel X (rad/s)',
            value: this._tuning.chassis.angvel.x,
            help: INPUT_HELP.angvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.angvelX.wrap);

        this._inputControls.angvelY = makeNumberControl({
            title: 'Angvel Y (rad/s)',
            value: this._tuning.chassis.angvel.y,
            help: INPUT_HELP.angvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.angvelY.wrap);

        this._inputControls.angvelZ = makeNumberControl({
            title: 'Angvel Z (rad/s)',
            value: this._tuning.chassis.angvel.z,
            help: INPUT_HELP.angvel,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        internalGroups.velocity.body.appendChild(this._inputControls.angvelZ.wrap);

        rightCol.appendChild(makeSeparator());
        rightCol.appendChild(makeLabel('Forces and Impulses'));

        this._inputControls.forceX = makeNumberControl({
            title: 'Force X (N)',
            value: this._forces.force.x,
            help: INPUT_HELP.force,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forceX.wrap);

        this._inputControls.forceY = makeNumberControl({
            title: 'Force Y (N)',
            value: this._forces.force.y,
            help: INPUT_HELP.force,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forceY.wrap);

        this._inputControls.forceZ = makeNumberControl({
            title: 'Force Z (N)',
            value: this._forces.force.z,
            help: INPUT_HELP.force,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forceZ.wrap);

        this._inputControls.forcePointX = makeNumberControl({
            title: 'Force point X (m)',
            value: this._forces.forcePoint.x,
            help: INPUT_HELP.forcePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forcePointX.wrap);

        this._inputControls.forcePointY = makeNumberControl({
            title: 'Force point Y (m)',
            value: this._forces.forcePoint.y,
            help: INPUT_HELP.forcePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forcePointY.wrap);

        this._inputControls.forcePointZ = makeNumberControl({
            title: 'Force point Z (m)',
            value: this._forces.forcePoint.z,
            help: INPUT_HELP.forcePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.forcePointZ.wrap);

        this._inputControls.torqueX = makeNumberControl({
            title: 'Torque X (N*m)',
            value: this._forces.torque.x,
            help: INPUT_HELP.torque,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueX.wrap);

        this._inputControls.torqueY = makeNumberControl({
            title: 'Torque Y (N*m)',
            value: this._forces.torque.y,
            help: INPUT_HELP.torque,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueY.wrap);

        this._inputControls.torqueZ = makeNumberControl({
            title: 'Torque Z (N*m)',
            value: this._forces.torque.z,
            help: INPUT_HELP.torque,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueZ.wrap);

        const forceActions = document.createElement('div');
        forceActions.style.display = 'flex';
        forceActions.style.flexWrap = 'wrap';
        forceActions.style.gap = '8px';
        forceActions.style.marginBottom = '10px';

        const addForceButton = makeButton('Add force');
        addForceButton.addEventListener('click', () => this.onAddForce?.(this._forces.force));
        forceActions.appendChild(addForceButton);
        this._actionButtons.push(addForceButton);

        const addForcePointButton = makeButton('Add force @ point');
        addForcePointButton.addEventListener('click', () => this.onAddForceAtPoint?.(this._forces.force, this._forces.forcePoint));
        forceActions.appendChild(addForcePointButton);
        this._actionButtons.push(addForcePointButton);

        const addTorqueButton = makeButton('Add torque');
        addTorqueButton.addEventListener('click', () => this.onAddTorque?.(this._forces.torque));
        forceActions.appendChild(addTorqueButton);
        this._actionButtons.push(addTorqueButton);

        const resetForcesButton = makeButton('Reset forces');
        resetForcesButton.addEventListener('click', () => this.onResetForces?.());
        forceActions.appendChild(resetForcesButton);
        this._actionButtons.push(resetForcesButton);

        const resetTorquesButton = makeButton('Reset torques');
        resetTorquesButton.addEventListener('click', () => this.onResetTorques?.());
        forceActions.appendChild(resetTorquesButton);
        this._actionButtons.push(resetTorquesButton);

        rightCol.appendChild(forceActions);

        this._inputControls.impulseX = makeNumberControl({
            title: 'Impulse X (N*s)',
            value: this._forces.impulse.x,
            help: INPUT_HELP.impulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulseX.wrap);

        this._inputControls.impulseY = makeNumberControl({
            title: 'Impulse Y (N*s)',
            value: this._forces.impulse.y,
            help: INPUT_HELP.impulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulseY.wrap);

        this._inputControls.impulseZ = makeNumberControl({
            title: 'Impulse Z (N*s)',
            value: this._forces.impulse.z,
            help: INPUT_HELP.impulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulseZ.wrap);

        this._inputControls.impulsePointX = makeNumberControl({
            title: 'Impulse point X (m)',
            value: this._forces.impulsePoint.x,
            help: INPUT_HELP.impulsePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulsePointX.wrap);

        this._inputControls.impulsePointY = makeNumberControl({
            title: 'Impulse point Y (m)',
            value: this._forces.impulsePoint.y,
            help: INPUT_HELP.impulsePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulsePointY.wrap);

        this._inputControls.impulsePointZ = makeNumberControl({
            title: 'Impulse point Z (m)',
            value: this._forces.impulsePoint.z,
            help: INPUT_HELP.impulsePoint,
            helpSystem,
            step: 0.1,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.impulsePointZ.wrap);

        this._inputControls.torqueImpulseX = makeNumberControl({
            title: 'Torque impulse X (N*m*s)',
            value: this._forces.torqueImpulse.x,
            help: INPUT_HELP.torqueImpulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueImpulseX.wrap);

        this._inputControls.torqueImpulseY = makeNumberControl({
            title: 'Torque impulse Y (N*m*s)',
            value: this._forces.torqueImpulse.y,
            help: INPUT_HELP.torqueImpulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueImpulseY.wrap);

        this._inputControls.torqueImpulseZ = makeNumberControl({
            title: 'Torque impulse Z (N*m*s)',
            value: this._forces.torqueImpulse.z,
            help: INPUT_HELP.torqueImpulse,
            helpSystem,
            step: 10,
            width: '100px'
        });
        rightCol.appendChild(this._inputControls.torqueImpulseZ.wrap);

        const impulseActions = document.createElement('div');
        impulseActions.style.display = 'flex';
        impulseActions.style.flexWrap = 'wrap';
        impulseActions.style.gap = '8px';
        impulseActions.style.marginBottom = '10px';

        const applyImpulseButton = makeButton('Apply impulse');
        applyImpulseButton.addEventListener('click', () => this.onApplyImpulse?.(this._forces.impulse));
        impulseActions.appendChild(applyImpulseButton);
        this._actionButtons.push(applyImpulseButton);

        const applyImpulsePointButton = makeButton('Apply impulse @ point');
        applyImpulsePointButton.addEventListener('click', () => this.onApplyImpulseAtPoint?.(this._forces.impulse, this._forces.impulsePoint));
        impulseActions.appendChild(applyImpulsePointButton);
        this._actionButtons.push(applyImpulsePointButton);

        const applyTorqueImpulseButton = makeButton('Apply torque impulse');
        applyTorqueImpulseButton.addEventListener('click', () => this.onApplyTorqueImpulse?.(this._forces.torqueImpulse));
        impulseActions.appendChild(applyTorqueImpulseButton);
        this._actionButtons.push(applyTorqueImpulseButton);

        rightCol.appendChild(impulseActions);

        this._inputControls.additionalMass = makeNumberControl({
            title: 'Additional mass (kg)',
            value: this._tuning.chassis.additionalMass,
            help: INPUT_HELP.additionalMass,
            helpSystem,
            step: 10,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.additionalMass.wrap);

        this._inputControls.massPropsMass = makeNumberControl({
            title: 'Mass props mass (kg)',
            value: this._tuning.chassis.additionalMassProperties.mass,
            help: INPUT_HELP.massPropsMass,
            helpSystem,
            step: 1,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsMass.wrap);

        this._inputControls.massPropsComX = makeNumberControl({
            title: 'Center of mass X',
            value: this._tuning.chassis.additionalMassProperties.com.x,
            help: INPUT_HELP.massPropsComX,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsComX.wrap);

        this._inputControls.massPropsComY = makeNumberControl({
            title: 'Center of mass Y',
            value: this._tuning.chassis.additionalMassProperties.com.y,
            help: INPUT_HELP.massPropsComY,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsComY.wrap);

        this._inputControls.massPropsComZ = makeNumberControl({
            title: 'Center of mass Z',
            value: this._tuning.chassis.additionalMassProperties.com.z,
            help: INPUT_HELP.massPropsComZ,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsComZ.wrap);

        internalGroups.mass.body.appendChild(makeLabel('Inertia (Principal)'));

        this._inputControls.massPropsInertiaX = makeNumberControl({
            title: 'Inertia X',
            value: this._tuning.chassis.additionalMassProperties.inertia.x,
            help: INPUT_HELP.massPropsInertiaX,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsInertiaX.wrap);

        this._inputControls.massPropsInertiaY = makeNumberControl({
            title: 'Inertia Y',
            value: this._tuning.chassis.additionalMassProperties.inertia.y,
            help: INPUT_HELP.massPropsInertiaY,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsInertiaY.wrap);

        this._inputControls.massPropsInertiaZ = makeNumberControl({
            title: 'Inertia Z',
            value: this._tuning.chassis.additionalMassProperties.inertia.z,
            help: INPUT_HELP.massPropsInertiaZ,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsInertiaZ.wrap);

        internalGroups.mass.body.appendChild(makeLabel('Inertia Frame (Quat)'));

        this._inputControls.massPropsFrameW = makeNumberControl({
            title: 'Inertia frame W',
            value: this._tuning.chassis.additionalMassProperties.inertiaFrame.w,
            help: INPUT_HELP.massPropsFrameW,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsFrameW.wrap);

        this._inputControls.massPropsFrameX = makeNumberControl({
            title: 'Inertia frame X',
            value: this._tuning.chassis.additionalMassProperties.inertiaFrame.x,
            help: INPUT_HELP.massPropsFrameX,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsFrameX.wrap);

        this._inputControls.massPropsFrameY = makeNumberControl({
            title: 'Inertia frame Y',
            value: this._tuning.chassis.additionalMassProperties.inertiaFrame.y,
            help: INPUT_HELP.massPropsFrameY,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsFrameY.wrap);

        this._inputControls.massPropsFrameZ = makeNumberControl({
            title: 'Inertia frame Z',
            value: this._tuning.chassis.additionalMassProperties.inertiaFrame.z,
            help: INPUT_HELP.massPropsFrameZ,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.mass.body.appendChild(this._inputControls.massPropsFrameZ.wrap);

        this._inputControls.lockTranslations = makeToggleControl({
            title: 'Lock translations',
            value: this._tuning.chassis.lockTranslations,
            help: INPUT_HELP.lockTranslations,
            helpSystem
        });
        internalGroups.locks.body.appendChild(this._inputControls.lockTranslations.wrap);

        this._inputControls.lockRotations = makeToggleControl({
            title: 'Lock rotations',
            value: this._tuning.chassis.lockRotations,
            help: INPUT_HELP.lockRotations,
            helpSystem
        });
        internalGroups.locks.body.appendChild(this._inputControls.lockRotations.wrap);

        this._inputControls.enabledRotX = makeToggleControl({
            title: 'Enable rotation X',
            value: this._tuning.chassis.enabledRotations.x,
            help: INPUT_HELP.enabledRotations,
            helpSystem
        });
        internalGroups.locks.body.appendChild(this._inputControls.enabledRotX.wrap);

        this._inputControls.enabledRotY = makeToggleControl({
            title: 'Enable rotation Y',
            value: this._tuning.chassis.enabledRotations.y,
            help: INPUT_HELP.enabledRotations,
            helpSystem
        });
        internalGroups.locks.body.appendChild(this._inputControls.enabledRotY.wrap);

        this._inputControls.enabledRotZ = makeToggleControl({
            title: 'Enable rotation Z',
            value: this._tuning.chassis.enabledRotations.z,
            help: INPUT_HELP.enabledRotations,
            helpSystem
        });
        internalGroups.locks.body.appendChild(this._inputControls.enabledRotZ.wrap);

        this._inputControls.linearDamping = makeNumberControl({
            title: 'Linear damping',
            value: this._tuning.chassis.linearDamping,
            help: INPUT_HELP.linearDamping,
            helpSystem,
            step: 0.01,
            width: '100px'
        });
        internalGroups.damping.body.appendChild(this._inputControls.linearDamping.wrap);

        this._inputControls.angularDamping = makeNumberControl({
            title: 'Angular damping',
            value: this._tuning.chassis.angularDamping,
            help: INPUT_HELP.angularDamping,
            helpSystem,
            step: 0.01,
            width: '100px'
        });
        internalGroups.damping.body.appendChild(this._inputControls.angularDamping.wrap);

        this._inputControls.dominanceGroup = makeNumberControl({
            title: 'Dominance group',
            value: this._tuning.chassis.dominanceGroup,
            help: INPUT_HELP.dominanceGroup,
            helpSystem,
            min: -127,
            max: 127,
            step: 1,
            width: '100px'
        });
        internalGroups.dominance.body.appendChild(this._inputControls.dominanceGroup.wrap);

        this._inputControls.ccdEnabled = makeToggleControl({
            title: 'CCD enabled',
            value: this._tuning.chassis.ccdEnabled,
            help: INPUT_HELP.ccdEnabled,
            helpSystem
        });
        internalGroups.ccd.body.appendChild(this._inputControls.ccdEnabled.wrap);

        this._inputControls.canSleep = makeToggleControl({
            title: 'Can sleep',
            value: this._tuning.chassis.canSleep,
            help: INPUT_HELP.canSleep,
            helpSystem
        });
        internalGroups.sleeping.body.appendChild(this._inputControls.canSleep.wrap);

        const wakeButton = makeButton('Wake up');
        wakeButton.addEventListener('click', () => this.onWakeUp?.());
        this._actionButtons.push(wakeButton);
        rightCol.appendChild(makeSeparator());
        rightCol.appendChild(makeLabel('Body Actions'));
        rightCol.appendChild(wakeButton);

        leftCol.appendChild(makeLabel('Wheel Forces'));

        this._inputControls.engineForce = makeRangeControl({
            title: 'setWheelEngineForce (N)',
            min: 0,
            max: 25000,
            step: 100,
            value: this._inputs.engineForce,
            fmt: (v) => formatNum(v, 0),
            help: INPUT_HELP.engineForce,
            helpSystem
        });
        leftCol.appendChild(this._inputControls.engineForce.wrap);

        this._inputControls.brakeForce = makeRangeControl({
            title: 'setWheelBrake (N)',
            min: 0,
            max: 25000,
            step: 100,
            value: this._inputs.brakeForce,
            fmt: (v) => formatNum(v, 0),
            help: INPUT_HELP.brakeForce,
            helpSystem
        });
        leftCol.appendChild(this._inputControls.brakeForce.wrap);

        this._inputControls.handbrakeForce = makeRangeControl({
            title: 'Rear handbrake (N)',
            min: 0,
            max: 25000,
            step: 100,
            value: this._inputs.handbrakeForce,
            fmt: (v) => formatNum(v, 0),
            help: INPUT_HELP.handbrakeForce,
            helpSystem
        });
        leftCol.appendChild(this._inputControls.handbrakeForce.wrap);

        leftCol.appendChild(makeLabel('Steering'));

        this._inputControls.steerAngle = makeKnobControl({
            title: 'setWheelSteering (rad)',
            min: -0.8,
            max: 0.8,
            step: 0.01,
            value: this._inputs.steerAngle,
            fmt: (v) => formatNum(v, 2),
            help: INPUT_HELP.steerAngle,
            helpSystem
        });
        leftCol.appendChild(this._inputControls.steerAngle.wrap);

        this._inputControls.groundClearance = makeNumberControl({
            title: 'Ground clearance (m)',
            value: this._vehicleConfig.groundClearance,
            help: INPUT_HELP.groundClearance,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.vehicle.body.appendChild(this._inputControls.groundClearance.wrap);

        internalGroups.vehicle.body.appendChild(makeLabel('Wheel placement'));

        this._inputControls.wheelSideInset = makeRangeControl({
            title: 'Wheel side offset (m)',
            min: 0,
            max: 0.4,
            step: 0.01,
            value: this._vehicleConfig.wheelSideInset,
            fmt: (v) => formatNum(v, 2),
            help: INPUT_HELP.wheelSideInset,
            helpSystem
        });
        internalGroups.vehicle.body.appendChild(this._inputControls.wheelSideInset.wrap);

        this._inputControls.wheelbaseRatio = makeRangeControl({
            title: 'Wheelbase ratio',
            min: 0.4,
            max: 0.9,
            step: 0.01,
            value: this._vehicleConfig.wheelbaseRatio,
            fmt: (v) => formatNum(v, 2),
            help: INPUT_HELP.wheelbaseRatio,
            helpSystem
        });
        internalGroups.vehicle.body.appendChild(this._inputControls.wheelbaseRatio.wrap);

        this._inputControls.restLength = makeNumberControl({
            title: 'Suspension rest length (m)',
            value: this._vehicleConfig.restLength,
            help: INPUT_HELP.restLength,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.restLength.wrap);

        this._inputControls.suspMaxTravel = makeNumberControl({
            title: 'Max travel (m)',
            value: this._tuning.suspension.maxTravel,
            help: INPUT_HELP.suspMaxTravel,
            helpSystem,
            step: 0.01,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.suspMaxTravel.wrap);

        this._inputControls.suspStiffness = makeNumberControl({
            title: 'Stiffness',
            value: this._tuning.suspension.stiffness,
            help: INPUT_HELP.suspStiffness,
            helpSystem,
            step: 500,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.suspStiffness.wrap);

        this._inputControls.suspCompression = makeNumberControl({
            title: 'Compression',
            value: this._tuning.suspension.compression,
            help: INPUT_HELP.suspCompression,
            helpSystem,
            step: 200,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.suspCompression.wrap);

        this._inputControls.suspRelaxation = makeNumberControl({
            title: 'Relaxation',
            value: this._tuning.suspension.relaxation,
            help: INPUT_HELP.suspRelaxation,
            helpSystem,
            step: 200,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.suspRelaxation.wrap);

        this._inputControls.suspMaxForce = makeNumberControl({
            title: 'Max force',
            value: this._tuning.suspension.maxForce,
            help: INPUT_HELP.suspMaxForce,
            helpSystem,
            step: 500,
            width: '110px'
        });
        internalGroups.suspension.body.appendChild(this._inputControls.suspMaxForce.wrap);

        this._inputControls.tireFrictionSlip = makeNumberControl({
            title: 'Friction slip',
            value: this._tuning.tires.frictionSlip,
            help: INPUT_HELP.tireFrictionSlip,
            helpSystem,
            step: 0.1,
            width: '110px'
        });
        internalGroups.tires.body.appendChild(this._inputControls.tireFrictionSlip.wrap);

        this._inputControls.tireSideStiffness = makeNumberControl({
            title: 'Side friction stiffness',
            value: this._tuning.tires.sideFrictionStiffness,
            help: INPUT_HELP.tireSideStiffness,
            helpSystem,
            step: 0.05,
            width: '110px'
        });
        internalGroups.tires.body.appendChild(this._inputControls.tireSideStiffness.wrap);

        const resetButton = makeButton('Reset vehicle');
        resetButton.addEventListener('click', () => this.onReset?.());
        leftCol.appendChild(resetButton);

        const resetInitialButton = makeButton('Reset initial position');
        resetInitialButton.addEventListener('click', () => this._resetInitialPosition());
        leftCol.appendChild(resetInitialButton);

        leftCol.appendChild(makeSeparator());
        leftCol.appendChild(makeLabel('World'));

        const gravityRow = makeInlineVector3Control({
            title: 'Gravity (m/s^2)',
            values: this._worldConfig.gravity,
            help: INPUT_HELP.worldGravity,
            helpSystem,
            step: 0.1,
            width: '76px'
        });
        this._inputControls.worldGravityX = { input: gravityRow.inputs.x, valEl: null };
        this._inputControls.worldGravityY = { input: gravityRow.inputs.y, valEl: null };
        this._inputControls.worldGravityZ = { input: gravityRow.inputs.z, valEl: null };
        leftCol.appendChild(gravityRow.wrap);

        this._inputControls.gravityScale = makeRangeControl({
            title: 'Gravity scale',
            min: 0,
            max: 3,
            step: 0.05,
            value: this._tuning.chassis.gravityScale,
            fmt: (v) => formatNum(v, 2),
            help: INPUT_HELP.gravityScale,
            helpSystem
        });
        leftCol.appendChild(this._inputControls.gravityScale.wrap);

        leftCol.appendChild(internalGroups.ccd.wrap);
        leftCol.appendChild(internalGroups.sleeping.wrap);

        leftCol.appendChild(internalGroups.bodyType.wrap);

        leftCol.appendChild(makeSeparator());
        leftCol.appendChild(makeLabel('Automated Tests'));

        const testsWrap = document.createElement('div');
        testsWrap.style.display = 'flex';
        testsWrap.style.flexWrap = 'wrap';
        testsWrap.style.gap = '8px';
        testsWrap.style.marginBottom = '10px';

        for (const test of PRESET_TESTS) {
            const btn = makeButton(test.label);
            btn.style.width = '180px';
            btn.style.flex = '0 0 180px';
            btn.addEventListener('click', () => this._startTest(test));
            testsWrap.appendChild(btn);
            this._testButtons.push(btn);
        }

        leftCol.appendChild(testsWrap);

        const sampleWrap = document.createElement('div');
        sampleWrap.style.display = 'flex';
        sampleWrap.style.flexWrap = 'wrap';
        sampleWrap.style.gap = '8px';
        sampleWrap.style.marginBottom = '10px';

        const recordButton = makeButton('Record sample');
        recordButton.style.width = '180px';
        recordButton.style.flex = '0 0 180px';
        recordButton.addEventListener('click', () => this._startSampleRecord());
        sampleWrap.appendChild(recordButton);
        this._recordButton = recordButton;

        leftCol.appendChild(sampleWrap);

        const status = document.createElement('div');
        status.style.fontSize = '12px';
        status.style.opacity = '0.8';
        status.textContent = 'Loading…';
        leftCol.appendChild(status);
        this._statusText = status;

        const copyButton = makeButton('Copy Telemetry');
        copyButton.style.display = 'none';
        copyButton.addEventListener('click', () => this._copyTelemetry());
        leftCol.appendChild(copyButton);
        this._copyButton = copyButton;

        const outputPanel = document.createElement('div');
        stylePanel(outputPanel, { interactive: true });
        outputPanel.style.flex = '1 1 320px';
        outputPanel.style.minWidth = '280px';
        outputPanel.style.width = 'auto';
        outputPanel.style.overflowX = 'hidden';
        outputPanel.appendChild(makeTitle('Rapier Output'));

        this._outputRows.status = makeValueRow('Status', { help: OUTPUT_HELP.status, helpSystem });
        outputPanel.appendChild(this._outputRows.status.row);

        this._outputRows.speed = makeValueRow('Speed (controller)', { help: OUTPUT_HELP.speed, helpSystem, bar: true });
        this._outputRows.speedKph = makeValueRow('Speed (controller)\nkm/h', { help: OUTPUT_HELP.speedKph, helpSystem });
        this._outputRows.speedProj = makeValueRow('Speed (projected)\nforward', { help: OUTPUT_HELP.speedProj, helpSystem, bar: true });
        this._outputRows.yaw = makeValueRow('Yaw (deg)', { help: OUTPUT_HELP.yaw, helpSystem, arrow: true });
        this._outputRows.axes = makeValueRow('Controller axes\nup/forward', { help: OUTPUT_HELP.axes, helpSystem });
        this._outputRows.mass = makeValueRow('Mass (kg)', { help: OUTPUT_HELP.mass, helpSystem });
        this._outputRows.position = makeValueRow('Position (m)', { help: OUTPUT_HELP.position, helpSystem });
        this._outputRows.rotation = makeValueRow('Rotation (quat)', { help: OUTPUT_HELP.rotation, helpSystem });
        this._outputRows.linvel = makeValueRow('Linear velocity (m/s)', { help: OUTPUT_HELP.linvel, helpSystem });
        this._outputRows.angvel = makeValueRow('Angular velocity (rad/s)', { help: OUTPUT_HELP.angvel, helpSystem });
        this._outputRows.contacts = makeValueRow('Wheel contacts', { help: OUTPUT_HELP.contacts, helpSystem, dots: 4 });
        this._outputRows.rayDown = makeValueRow('Ray down hit', { help: OUTPUT_HELP.rayDown, helpSystem });
        this._outputRows.counts = makeValueRow('World counts', { help: OUTPUT_HELP.counts, helpSystem });

        outputPanel.appendChild(this._outputRows.speed.row);
        outputPanel.appendChild(this._outputRows.speedKph.row);
        outputPanel.appendChild(this._outputRows.speedProj.row);
        outputPanel.appendChild(this._outputRows.yaw.row);
        outputPanel.appendChild(this._outputRows.axes.row);
        outputPanel.appendChild(this._outputRows.mass.row);
        outputPanel.appendChild(this._outputRows.position.row);
        outputPanel.appendChild(this._outputRows.rotation.row);
        outputPanel.appendChild(this._outputRows.linvel.row);
        outputPanel.appendChild(this._outputRows.angvel.row);
        outputPanel.appendChild(this._outputRows.contacts.row);
        outputPanel.appendChild(this._outputRows.rayDown.row);
        outputPanel.appendChild(this._outputRows.counts.row);

        outputPanel.appendChild(makeSeparator());
        const wheelsLabel = makeLabel('Wheels');
        appendHelp(wheelsLabel, OUTPUT_HELP.wheels, helpSystem);
        outputPanel.appendChild(wheelsLabel);

        const wheelTable = document.createElement('div');
        wheelTable.style.display = 'grid';
        wheelTable.style.gridTemplateColumns = 'minmax(140px, 1fr) minmax(140px, 1fr)';
        wheelTable.style.gap = '12px';
        wheelTable.style.justifyContent = 'center';

        const headerLeft = document.createElement('div');
        headerLeft.textContent = 'Left wheels';
        headerLeft.style.fontSize = '12px';
        headerLeft.style.fontWeight = '800';
        headerLeft.style.opacity = '0.85';
        headerLeft.style.textTransform = 'uppercase';
        headerLeft.style.letterSpacing = '0.3px';
        headerLeft.style.textAlign = 'center';

        const headerRight = headerLeft.cloneNode(true);
        headerRight.textContent = 'Right wheels';

        const makeWheelCell = (wheelLabel) => {
            const cell = document.createElement('div');
            const baseBg = 'rgba(255,255,255,0.06)';
            const baseBorder = 'rgba(255,255,255,0.10)';
            const hoverBg = 'rgba(76,255,122,0.14)';
            const hoverBorder = 'rgba(76,255,122,0.65)';
            const hoverShadow = '0 0 14px rgba(76,255,122,0.35)';
            cell.style.background = baseBg;
            cell.style.border = `1px solid ${baseBorder}`;
            cell.style.borderRadius = '12px';
            cell.style.padding = '10px 10px 12px';
            cell.style.position = 'relative';
            cell.style.minHeight = '184px';
            cell.style.transition = 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease';

            const arrow = makeArrowMarker({ size: 14, color: 'rgba(233, 242, 255, 0.9)' });
            arrow.style.position = 'absolute';
            arrow.style.top = '10px';
            arrow.style.left = '10px';
            cell.appendChild(arrow);

            const knob = document.createElement('div');
            knob.style.position = 'absolute';
            knob.style.top = '10px';
            knob.style.right = '10px';
            knob.style.width = '11px';
            knob.style.height = '11px';
            knob.style.borderRadius = '999px';
            knob.style.background = '#c8cbd1';
            knob.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.25)';
            knob.style.opacity = '0.85';
            cell.appendChild(knob);

            const text = document.createElement('div');
            text.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
            text.style.fontSize = '12px';
            text.style.fontVariantNumeric = 'tabular-nums';
            text.style.whiteSpace = 'pre';
            text.style.lineHeight = '1.25';
            text.style.paddingLeft = '18px';
            text.textContent = '—';
            cell.appendChild(text);

            const barWrap = document.createElement('div');
            barWrap.style.marginTop = '6px';
            barWrap.style.width = '100%';
            barWrap.style.height = '6px';
            barWrap.style.borderRadius = '999px';
            barWrap.style.background = 'rgba(255,255,255,0.12)';
            barWrap.style.overflow = 'hidden';

            const barFill = document.createElement('div');
            barFill.style.height = '100%';
            barFill.style.width = '0%';
            barFill.style.background = 'rgba(76,255,122,0.85)';
            barWrap.appendChild(barFill);
            cell.appendChild(barWrap);

            const setHover = (active) => {
                cell.style.background = active ? hoverBg : baseBg;
                cell.style.borderColor = active ? hoverBorder : baseBorder;
                cell.style.boxShadow = active ? hoverShadow : 'none';
            };

            cell.addEventListener('mouseenter', () => {
                setHover(true);
                this.onWheelHover?.(wheelLabel);
            });
            cell.addEventListener('mouseleave', () => {
                setHover(false);
                this.onWheelHover?.(null);
            });
            return { root: cell, textEl: text, knobEl: knob, arrowEl: arrow, barEl: barFill, label: wheelLabel };
        };

        wheelTable.appendChild(headerLeft);
        wheelTable.appendChild(headerRight);

        const fl = makeWheelCell('FL');
        const fr = makeWheelCell('FR');
        const rl = makeWheelCell('RL');
        const rr = makeWheelCell('RR');
        this._wheelCells = { fl, fr, rl, rr };

        wheelTable.appendChild(fl.root);
        wheelTable.appendChild(fr.root);
        wheelTable.appendChild(rl.root);
        wheelTable.appendChild(rr.root);

        outputPanel.appendChild(wheelTable);

        root.appendChild(inputPanel);
        root.appendChild(outputPanel);
        document.body.appendChild(root);

        this._hudRoot = root;
        this._inputPanel = inputPanel;
        this._outputPanel = outputPanel;

        this._wireControls();
    }

    _createHelpSystem(root) {
        const tooltip = document.createElement('div');
        tooltip.style.position = 'fixed';
        tooltip.style.maxWidth = '280px';
        tooltip.style.padding = '8px 10px';
        tooltip.style.borderRadius = '10px';
        tooltip.style.background = 'rgba(10, 14, 20, 0.92)';
        tooltip.style.border = '1px solid rgba(255,255,255,0.18)';
        tooltip.style.color = '#e9f2ff';
        tooltip.style.fontSize = '12px';
        tooltip.style.lineHeight = '1.3';
        tooltip.style.boxShadow = '0 8px 24px rgba(0,0,0,0.45)';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '80';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);
        this._helpTooltip = tooltip;

        const move = (event) => {
            if (!this._helpTooltip || this._helpTooltip.style.display === 'none') return;
            const pad = 12;
            const rect = this._helpTooltip.getBoundingClientRect();
            const x = Math.min(window.innerWidth - rect.width - pad, event.clientX + pad);
            const y = Math.min(window.innerHeight - rect.height - pad, event.clientY + pad);
            this._helpTooltip.style.left = `${Math.max(pad, x)}px`;
            this._helpTooltip.style.top = `${Math.max(pad, y)}px`;
        };

        return {
            show: (text, event) => {
                if (!this._helpTooltip) return;
                this._helpTooltip.textContent = text;
                this._helpTooltip.style.display = 'block';
                move(event);
            },
            move,
            hide: () => {
                if (!this._helpTooltip) return;
                this._helpTooltip.style.display = 'none';
            }
        };
    }

    _wireControls() {
        const wire = (control, key) => {
            if (!control?.input) return;
            const input = control.input;
            const isSelect = input.tagName === 'SELECT';
            const isCheckbox = input.type === 'checkbox';
            const readValue = () => {
                if (isCheckbox) return input.checked;
                if (isSelect) return input.value;
                const value = parseFloat(input.value);
                if (!Number.isFinite(value)) return null;
                return value;
            };
            const eventName = (isCheckbox || isSelect) ? 'change' : 'input';
            input.addEventListener(eventName, () => {
                const value = readValue();
                if (value === null) return;
                this._setInputValue(key, value);
            });
        };

        wire(this._inputControls.bodyType, 'bodyType');
        wire(this._inputControls.translationX, 'translationX');
        wire(this._inputControls.spawnHeight, 'spawnHeight');
        wire(this._inputControls.translationZ, 'translationZ');
        wire(this._inputControls.rotationW, 'rotationW');
        wire(this._inputControls.rotationX, 'rotationX');
        wire(this._inputControls.rotationY, 'rotationY');
        wire(this._inputControls.rotationZ, 'rotationZ');
        wire(this._inputControls.linvelX, 'linvelX');
        wire(this._inputControls.linvelY, 'linvelY');
        wire(this._inputControls.linvelZ, 'linvelZ');
        wire(this._inputControls.angvelX, 'angvelX');
        wire(this._inputControls.angvelY, 'angvelY');
        wire(this._inputControls.angvelZ, 'angvelZ');
        wire(this._inputControls.worldGravityX, 'worldGravityX');
        wire(this._inputControls.worldGravityY, 'worldGravityY');
        wire(this._inputControls.worldGravityZ, 'worldGravityZ');
        wire(this._inputControls.gravityScale, 'gravityScale');
        wire(this._inputControls.forceX, 'forceX');
        wire(this._inputControls.forceY, 'forceY');
        wire(this._inputControls.forceZ, 'forceZ');
        wire(this._inputControls.forcePointX, 'forcePointX');
        wire(this._inputControls.forcePointY, 'forcePointY');
        wire(this._inputControls.forcePointZ, 'forcePointZ');
        wire(this._inputControls.torqueX, 'torqueX');
        wire(this._inputControls.torqueY, 'torqueY');
        wire(this._inputControls.torqueZ, 'torqueZ');
        wire(this._inputControls.impulseX, 'impulseX');
        wire(this._inputControls.impulseY, 'impulseY');
        wire(this._inputControls.impulseZ, 'impulseZ');
        wire(this._inputControls.impulsePointX, 'impulsePointX');
        wire(this._inputControls.impulsePointY, 'impulsePointY');
        wire(this._inputControls.impulsePointZ, 'impulsePointZ');
        wire(this._inputControls.torqueImpulseX, 'torqueImpulseX');
        wire(this._inputControls.torqueImpulseY, 'torqueImpulseY');
        wire(this._inputControls.torqueImpulseZ, 'torqueImpulseZ');
        wire(this._inputControls.additionalMass, 'additionalMass');
        wire(this._inputControls.massPropsMass, 'massPropsMass');
        wire(this._inputControls.massPropsComX, 'massPropsComX');
        wire(this._inputControls.massPropsComY, 'massPropsComY');
        wire(this._inputControls.massPropsComZ, 'massPropsComZ');
        wire(this._inputControls.massPropsInertiaX, 'massPropsInertiaX');
        wire(this._inputControls.massPropsInertiaY, 'massPropsInertiaY');
        wire(this._inputControls.massPropsInertiaZ, 'massPropsInertiaZ');
        wire(this._inputControls.massPropsFrameW, 'massPropsFrameW');
        wire(this._inputControls.massPropsFrameX, 'massPropsFrameX');
        wire(this._inputControls.massPropsFrameY, 'massPropsFrameY');
        wire(this._inputControls.massPropsFrameZ, 'massPropsFrameZ');
        wire(this._inputControls.lockTranslations, 'lockTranslations');
        wire(this._inputControls.lockRotations, 'lockRotations');
        wire(this._inputControls.enabledRotX, 'enabledRotX');
        wire(this._inputControls.enabledRotY, 'enabledRotY');
        wire(this._inputControls.enabledRotZ, 'enabledRotZ');
        wire(this._inputControls.linearDamping, 'linearDamping');
        wire(this._inputControls.angularDamping, 'angularDamping');
        wire(this._inputControls.dominanceGroup, 'dominanceGroup');
        wire(this._inputControls.ccdEnabled, 'ccdEnabled');
        wire(this._inputControls.canSleep, 'canSleep');
        wire(this._inputControls.engineForce, 'engineForce');
        wire(this._inputControls.brakeForce, 'brakeForce');
        wire(this._inputControls.handbrakeForce, 'handbrakeForce');
        wire(this._inputControls.steerAngle, 'steerAngle');
        wire(this._inputControls.groundClearance, 'groundClearance');
        wire(this._inputControls.wheelSideInset, 'wheelSideInset');
        wire(this._inputControls.restLength, 'restLength');
        wire(this._inputControls.wheelbaseRatio, 'wheelbaseRatio');
        wire(this._inputControls.suspMaxTravel, 'suspMaxTravel');
        wire(this._inputControls.suspStiffness, 'suspStiffness');
        wire(this._inputControls.suspCompression, 'suspCompression');
        wire(this._inputControls.suspRelaxation, 'suspRelaxation');
        wire(this._inputControls.suspMaxForce, 'suspMaxForce');
        wire(this._inputControls.tireFrictionSlip, 'tireFrictionSlip');
        wire(this._inputControls.tireSideStiffness, 'tireSideStiffness');
    }

    _setInputValue(key, value) {
        let next = value;
        if (key === 'bodyType') {
            this._tuning.chassis.bodyType = String(next);
        } else if (key === 'translationX') {
            this._tuning.chassis.translation.x = next;
        } else if (key === 'spawnHeight') {
            this._vehicleConfig.spawnHeight = next;
            this._tuning.chassis.translation.y = next;
        } else if (key === 'translationZ') {
            this._tuning.chassis.translation.z = next;
        } else if (key === 'rotationW') {
            this._tuning.chassis.rotation.w = next;
        } else if (key === 'rotationX') {
            this._tuning.chassis.rotation.x = next;
        } else if (key === 'rotationY') {
            this._tuning.chassis.rotation.y = next;
        } else if (key === 'rotationZ') {
            this._tuning.chassis.rotation.z = next;
        } else if (key === 'linvelX') {
            this._tuning.chassis.linvel.x = next;
        } else if (key === 'linvelY') {
            this._tuning.chassis.linvel.y = next;
        } else if (key === 'linvelZ') {
            this._tuning.chassis.linvel.z = next;
        } else if (key === 'angvelX') {
            this._tuning.chassis.angvel.x = next;
        } else if (key === 'angvelY') {
            this._tuning.chassis.angvel.y = next;
        } else if (key === 'angvelZ') {
            this._tuning.chassis.angvel.z = next;
        } else if (key === 'worldGravityX') {
            this._worldConfig.gravity.x = next;
        } else if (key === 'worldGravityY') {
            this._worldConfig.gravity.y = next;
        } else if (key === 'worldGravityZ') {
            this._worldConfig.gravity.z = next;
        } else if (key === 'forceX') {
            this._forces.force.x = next;
        } else if (key === 'forceY') {
            this._forces.force.y = next;
        } else if (key === 'forceZ') {
            this._forces.force.z = next;
        } else if (key === 'forcePointX') {
            this._forces.forcePoint.x = next;
        } else if (key === 'forcePointY') {
            this._forces.forcePoint.y = next;
        } else if (key === 'forcePointZ') {
            this._forces.forcePoint.z = next;
        } else if (key === 'torqueX') {
            this._forces.torque.x = next;
        } else if (key === 'torqueY') {
            this._forces.torque.y = next;
        } else if (key === 'torqueZ') {
            this._forces.torque.z = next;
        } else if (key === 'impulseX') {
            this._forces.impulse.x = next;
        } else if (key === 'impulseY') {
            this._forces.impulse.y = next;
        } else if (key === 'impulseZ') {
            this._forces.impulse.z = next;
        } else if (key === 'impulsePointX') {
            this._forces.impulsePoint.x = next;
        } else if (key === 'impulsePointY') {
            this._forces.impulsePoint.y = next;
        } else if (key === 'impulsePointZ') {
            this._forces.impulsePoint.z = next;
        } else if (key === 'torqueImpulseX') {
            this._forces.torqueImpulse.x = next;
        } else if (key === 'torqueImpulseY') {
            this._forces.torqueImpulse.y = next;
        } else if (key === 'torqueImpulseZ') {
            this._forces.torqueImpulse.z = next;
        } else if (key === 'lockTranslations') {
            this._tuning.chassis.lockTranslations = !!next;
        } else if (key === 'lockRotations') {
            this._tuning.chassis.lockRotations = !!next;
        } else if (key === 'enabledRotX') {
            this._tuning.chassis.enabledRotations.x = !!next;
        } else if (key === 'enabledRotY') {
            this._tuning.chassis.enabledRotations.y = !!next;
        } else if (key === 'enabledRotZ') {
            this._tuning.chassis.enabledRotations.z = !!next;
        } else if (key === 'dominanceGroup') {
            this._tuning.chassis.dominanceGroup = next;
        } else if (key === 'ccdEnabled') {
            this._tuning.chassis.ccdEnabled = !!next;
        } else if (key === 'canSleep') {
            this._tuning.chassis.canSleep = !!next;
        } else if (key === 'engineForce') {
            this._inputs.engineForce = next;
        } else if (key === 'brakeForce') {
            this._inputs.brakeForce = next;
        } else if (key === 'handbrakeForce') {
            this._inputs.handbrakeForce = next;
        } else if (key === 'steerAngle') {
            this._inputs.steerAngle = next;
        } else if (key === 'groundClearance') {
            this._vehicleConfig.groundClearance = next;
        } else if (key === 'wheelSideInset') {
            this._vehicleConfig.wheelSideInset = next;
        } else if (key === 'restLength') {
            this._vehicleConfig.restLength = next;
        } else if (key === 'wheelbaseRatio') {
            this._vehicleConfig.wheelbaseRatio = next;
        } else if (key === 'additionalMass') {
            this._tuning.chassis.additionalMass = next;
        } else if (key === 'massPropsMass') {
            this._tuning.chassis.additionalMassProperties.mass = next;
        } else if (key === 'massPropsComX') {
            this._tuning.chassis.additionalMassProperties.com.x = next;
        } else if (key === 'massPropsComY') {
            this._tuning.chassis.additionalMassProperties.com.y = next;
        } else if (key === 'massPropsComZ') {
            this._tuning.chassis.additionalMassProperties.com.z = next;
        } else if (key === 'massPropsInertiaX') {
            this._tuning.chassis.additionalMassProperties.inertia.x = next;
        } else if (key === 'massPropsInertiaY') {
            this._tuning.chassis.additionalMassProperties.inertia.y = next;
        } else if (key === 'massPropsInertiaZ') {
            this._tuning.chassis.additionalMassProperties.inertia.z = next;
        } else if (key === 'massPropsFrameW') {
            this._tuning.chassis.additionalMassProperties.inertiaFrame.w = next;
        } else if (key === 'massPropsFrameX') {
            this._tuning.chassis.additionalMassProperties.inertiaFrame.x = next;
        } else if (key === 'massPropsFrameY') {
            this._tuning.chassis.additionalMassProperties.inertiaFrame.y = next;
        } else if (key === 'massPropsFrameZ') {
            this._tuning.chassis.additionalMassProperties.inertiaFrame.z = next;
        } else if (key === 'linearDamping') {
            this._tuning.chassis.linearDamping = next;
        } else if (key === 'angularDamping') {
            this._tuning.chassis.angularDamping = next;
        } else if (key === 'gravityScale') {
            this._tuning.chassis.gravityScale = next;
        } else if (key === 'suspMaxTravel') {
            this._tuning.suspension.maxTravel = next;
        } else if (key === 'suspStiffness') {
            this._tuning.suspension.stiffness = next;
        } else if (key === 'suspCompression') {
            this._tuning.suspension.compression = next;
        } else if (key === 'suspRelaxation') {
            this._tuning.suspension.relaxation = next;
        } else if (key === 'suspMaxForce') {
            this._tuning.suspension.maxForce = next;
        } else if (key === 'tireFrictionSlip') {
            this._tuning.tires.frictionSlip = next;
        } else if (key === 'tireSideStiffness') {
            this._tuning.tires.sideFrictionStiffness = next;
        }

        const control = this._inputControls[key];
        if (control) {
            if (control.input.type === 'checkbox') {
                control.input.checked = !!next;
            } else {
                control.input.value = String(next);
            }
            if (typeof control.update === 'function') {
                control.update(next);
            } else if (control.valEl) {
                control.valEl.textContent = control.fmt(next);
            }
        }
    }

    _startSampleRecord() {
        if (!this._enabled || this._activeTest || this._sampleRecording) return;
        this._sampleRecording = true;
        this._sampleElapsed = 0;
        this._sampleFrames = [];
        this._sampleConfig = this._buildSampleConfig();
        if (this._statusText) this._statusText.textContent = 'Recording sample…';
        if (this._recordButton) this._recordButton.disabled = true;
    }

    _recordSampleFrame(snapshot) {
        if (!this._sampleRecording || !this._sampleFrames) return;
        this._sampleFrames.push(this._packSampleFrame(snapshot, this._sampleElapsed));
    }

    _finishSampleRecord() {
        if (!this._sampleRecording) return;
        this._sampleRecording = false;
        const payload = JSON.stringify({ c: this._sampleConfig ?? null, f: this._sampleFrames ?? [] });
        const done = (ok) => {
            if (this._statusText) this._statusText.textContent = ok ? 'Sample copied' : 'Clipboard blocked';
            this._sampleFrames = null;
            this._sampleConfig = null;
            this._sampleElapsed = 0;
            if (this._recordButton) {
                this._recordButton.disabled = !this._enabled || !!this._activeTest || this._sampleRecording;
            }
        };
        try {
            navigator.clipboard.writeText(payload).then(() => done(true)).catch(() => done(false));
        } catch {
            done(false);
        }
    }

    _buildSampleConfig() {
        const inputs = this._inputs ?? {};
        const vehicle = this._vehicleConfig ?? {};
        const tuning = this._tuning ?? {};
        const chassis = tuning.chassis ?? {};
        const massProps = chassis.additionalMassProperties ?? {};
        const suspension = tuning.suspension ?? {};
        const tires = tuning.tires ?? {};
        const world = this._worldConfig ?? {};
        const gravity = world.gravity ?? {};
        return {
            i: {
                e: qNum(inputs.engineForce, 0),
                b: qNum(inputs.brakeForce, 0),
                h: qNum(inputs.handbrakeForce, 0),
                s: qNum(inputs.steerAngle, 3)
            },
            v: {
                sh: qNum(vehicle.spawnHeight, 3),
                gc: qNum(vehicle.groundClearance, 3),
                rl: qNum(vehicle.restLength, 3),
                wbr: qNum(vehicle.wheelbaseRatio, 3),
                wso: qNum(vehicle.wheelSideInset, 3)
            },
            t: {
                bt: chassis.bodyType ?? null,
                tr: packVec3(chassis.translation, 3),
                rot: packQuat(chassis.rotation, 4),
                lv: packVec3(chassis.linvel, 3),
                av: packVec3(chassis.angvel, 3),
                am: qNum(chassis.additionalMass, 1),
                ld: qNum(chassis.linearDamping, 3),
                ad: qNum(chassis.angularDamping, 3),
                gs: qNum(chassis.gravityScale, 3),
                cs: typeof chassis.canSleep === 'boolean' ? (chassis.canSleep ? 1 : 0) : null,
                ccd: typeof chassis.ccdEnabled === 'boolean' ? (chassis.ccdEnabled ? 1 : 0) : null,
                dg: Number.isFinite(chassis.dominanceGroup) ? chassis.dominanceGroup : null,
                lt: typeof chassis.lockTranslations === 'boolean' ? (chassis.lockTranslations ? 1 : 0) : null,
                lr: typeof chassis.lockRotations === 'boolean' ? (chassis.lockRotations ? 1 : 0) : null,
                er: [
                    chassis.enabledRotations?.x ? 1 : 0,
                    chassis.enabledRotations?.y ? 1 : 0,
                    chassis.enabledRotations?.z ? 1 : 0
                ],
                mp: {
                    m: qNum(massProps.mass, 1),
                    com: packVec3(massProps.com, 3),
                    in: packVec3(massProps.inertia, 3),
                    fr: packQuat(massProps.inertiaFrame, 4)
                }
            },
            s: {
                mt: qNum(suspension.maxTravel, 3),
                st: qNum(suspension.stiffness, 1),
                cp: qNum(suspension.compression, 1),
                rl: qNum(suspension.relaxation, 1),
                mf: qNum(suspension.maxForce, 1)
            },
            ti: {
                fs: qNum(tires.frictionSlip, 3),
                ss: qNum(tires.sideFrictionStiffness, 3)
            },
            w: {
                g: packVec3(gravity, 3)
            }
        };
    }

    _packSampleFrame(snapshot, elapsed) {
        const body = snapshot?.body ?? {};
        const contacts = snapshot?.contacts ?? {};
        const wheels = snapshot?.wheelStates ?? [];
        return {
            t: Math.round((elapsed ?? 0) * 1000),
            st: snapshot?.status ?? null,
            p: packVec3(body.position, 3),
            r: packQuat(body.rotation, 4),
            lv: packVec3(body.linvel, 3),
            av: packVec3(body.angvel, 3),
            sp: qNum(snapshot?.speedMps, 3),
            sp2: qNum(snapshot?.speedProjMps, 3),
            y: qNum(snapshot?.yawRad, 4),
            c: [contacts.count ?? 0, contacts.total ?? 0],
            w: wheels.map((w) => [
                w?.index ?? null,
                w?.inContact ? 1 : 0,
                qNum(w?.suspensionLength, 3),
                qNum(w?.suspensionForce, 1),
                qNum(w?.forwardImpulse, 2),
                qNum(w?.sideImpulse, 2),
                qNum(w?.steering, 3)
            ])
        };
    }

    _startTest(test) {
        if (!test) return;
        this._activeTest = test;
        this._telemetry = [];
        this._telemetryMeta = {
            id: test.id,
            label: test.label,
            startedAt: new Date().toISOString()
        };
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._copyButton.style.display = 'none';
        this._statusText.textContent = `Running ${test.label}…`;

        this.setEnabled(this._enabled);
    }

    _advanceTest(dt) {
        if (!this._activeTest) return;

        const steps = this._activeTest.steps ?? [];
        const curStep = steps[this._testStepIndex];
        if (!curStep) {
            this._finishTest();
            return;
        }

        this._testElapsed += dt;
        this._stepElapsed += dt;

        if (this._stepElapsed >= curStep.duration) {
            this._stepElapsed = 0;
            this._testStepIndex += 1;
            if (this._testStepIndex >= steps.length) {
                this._finishTest();
                return;
            }
        }

        const active = steps[this._testStepIndex];
        if (active?.input) {
            for (const [k, v] of Object.entries(active.input)) {
                if (Number.isFinite(v)) this._setInputValue(k, v);
            }
        }
    }

    _finishTest() {
        const label = this._activeTest?.label ?? 'Test';
        this._activeTest = null;
        this._statusText.textContent = `${label} complete`;
        if (this._copyButton) this._copyButton.style.display = this._telemetry?.length ? '' : 'none';
        this.setEnabled(this._enabled);
    }

    _recordTelemetry(snapshot) {
        if (!this._telemetry) return;
        this._telemetry.push({
            t: this._testElapsed,
            input: { ...this._inputs },
            output: snapshot
        });
    }

    async _copyTelemetry() {
        if (!this._telemetry || !this._telemetryMeta) return;
        const payload = JSON.stringify({ meta: this._telemetryMeta, frames: this._telemetry }, null, 2);
        try {
            await navigator.clipboard.writeText(payload);
            if (this._statusText) this._statusText.textContent = 'Telemetry copied';
        } catch {
            if (this._statusText) this._statusText.textContent = 'Clipboard blocked';
        }
    }

    _resetInitialPosition() {
        this._activeTest = null;
        this._testElapsed = 0;
        this._stepElapsed = 0;
        this._testStepIndex = 0;
        this._telemetry = null;
        this._telemetryMeta = null;
        if (this._copyButton) this._copyButton.style.display = 'none';
        this._sampleRecording = false;
        this._sampleElapsed = 0;
        this._sampleFrames = null;
        this._sampleConfig = null;
        if (this._recordButton) {
            this._recordButton.disabled = !this._enabled || !!this._activeTest || this._sampleRecording;
        }

        this._setInputValue('engineForce', 0);
        this._setInputValue('brakeForce', 0);
        this._setInputValue('handbrakeForce', 0);
        this._setInputValue('steerAngle', 0);

        if (this._statusText) this._statusText.textContent = this._enabled ? 'Ready' : 'Loading…';
        this.setEnabled(this._enabled);
        this.onReset?.();
    }
}
