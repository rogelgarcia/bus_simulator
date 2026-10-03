// Supplies explicit neutral sand calibration through the shared PBR resolver.
export default Object.freeze({
    schema: 'bus_sim.pbr_material_correction', version: 1,
    materialId: 'pbr.aerial_beach_01', label: 'Aerial Beach 01', classId: 'ground',
    textureFolder: 'assets/public/pbr/aerial_beach_01',
    sourceConfigFile: 'assets/public/pbr/aerial_beach_01/pbr.material.config.js',
    mapFiles: { baseColor: 'basecolor.jpg', normal: 'normal_gl.png', orm: 'arm.png' },
    analysis: { mode: 'authored', captures: [], notes: ['Neutral albedo; matte sand roughness and restrained normal strength. No automatic calibration claimed.'] },
    presets: {
        aces: {
            profileId: 'landscape_sand_v1',
            adjustments: {
                albedo: { mode: 'gain_tint', brightness: 1, hueDegrees: 0, saturation: 1, tintStrength: 0 },
                normal: { mode: 'scale', strength: 0.7 },
                metalness: { mode: 'constant', value: 0 },
                roughness: { sourceMap: 'orm', sourceChannel: 'g', normalizeInputPercentiles: [5, 95], min: 0.65, max: 0.98, gamma: 1 }
            }
        }
    }
});
