// Reuse measured pre-calibration settings at the comparison angle, without an incompatible bake.
export function uncalibrated55Baseline(baseline, original) {
    const result = structuredClone(baseline);
    const lighting = structuredClone(original.lighting);
    // The historical renderer used a white directional light before sunColorLinear existed.
    lighting.sunColorLinear ??= [1, 1, 1];
    delete lighting.ibl.hdrUrl;
    delete lighting.ibl.iblLabel;
    delete lighting.ibl.previewUrl;
    const atmosphere = structuredClone(original.atmosphere);
    atmosphere.sun = {azimuthDeg:45, elevationDeg:55};
    result.expectedMode = 'current';
    result.expectedSunProfile = 'ai527.sun.az045.el55';
    result.storage['bus_sim.bakedLighting.v1'].mode = 'current';
    result.storage['bus_sim.lighting.v1'] = lighting;
    result.storage['bus_sim.atmosphere.v1'] = atmosphere;
    result.settingsPolicy = 'Original measured lighting settings at 55 degrees on the corrected runtime. Current mode: the old 35-degree bake is incompatible. ACESFilmic, grading Off, sun bloom Off. This compares complete lighting configurations, not calibration alone.';
    return result;
}

export function assertUncalibrated55(record, baseline) {
    const expected = baseline.storage['bus_sim.lighting.v1'];
    for (const key of ['sunIntensity', 'hemiIntensity', 'exposure', 'toneMapping']) {
        if (record.lighting[key] !== expected[key]) throw new Error('Uncalibrated control changed ' + key);
    }
    if (JSON.stringify(record.lighting.sunColorLinear) !== JSON.stringify(expected.sunColorLinear))
        throw new Error('Uncalibrated control changed sun color');
    for (const key of ['iblId', 'envMapIntensity', 'enabled', 'setBackground']) {
        if (record.lighting.ibl[key] !== expected.ibl[key]) throw new Error('Uncalibrated control changed IBL ' + key);
    }
    if (record.atmosphere.sun.elevationDeg !== 55 || record.atmosphere.sun.azimuthDeg !== 45)
        throw new Error('Uncalibrated control has the wrong sun position');
    if (record.baked.status.effectiveMode !== 'current' || record.baked.receiverLightmaps.effective.indirect
        || record.shadow.state === 'active') throw new Error('Uncalibrated control retained an incompatible bake');
    if (record.graphics.colorGrading.preset !== 'off') throw new Error('Uncalibrated control retained a creative grade');
}
