// Defines the explicit AI 528 source, light, channel, and compiler references.

export const ILLUMINATION_EXPORT_PROFILE_SCHEMA = 'bus-sim-illumination-export-profile-v1';

export const ILLUMINATION_COMPILER_REFERENCE = Object.freeze({
    schema: 'bus-sim-illumination-compiler-reference-v1',
    id: 'blender-5.2.1-lts-cycles-cpu-contract-v1',
    archive: 'blender-5.2.1-windows-x64.zip',
    archiveSha256: '0e631dad7d0cad6d5d18abdd2e2550f6c0213215334eda00ddbd3d22b96ecb2c',
    backend: 'cycles_cpu',
    implementationOwner: 'AI_529',
    implementationStatus: 'pending',
    configurationRefs: Object.freeze([
        'specs/graphics/illumination_framework.md',
        'specs/graphics/illumination_bake_input.md',
        'prompts/AI_529_TOOLS_blender_cycles_headless_bake_compiler.md'
    ])
});

function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`[IlluminationBakeExporter] ${label} must be finite.`);
    return Object.is(number, -0) ? 0 : number;
}

function colorArray(color, label) {
    if (!color?.isColor) throw new Error(`[IlluminationBakeExporter] ${label} is unavailable.`);
    return [finite(color.r, `${label}.r`), finite(color.g, `${label}.g`), finite(color.b, `${label}.b`)];
}

export function createResolvedIlluminationExportProfile({ city, engine }) {
    if (!city?.cityId || !city?.sunRef?.direction || !engine) {
        throw new Error('[IlluminationBakeExporter] A resolved gameplay city and engine are required.');
    }
    const sunDirection = city.sunRef.direction;
    const environment = engine.scene?.environment ?? null;
    const lightingSettings = engine.lightingSettings ?? null;
    const iblSettings = lightingSettings?.ibl ?? null;
    const iblEnabled = iblSettings?.enabled !== false;
    if (iblEnabled && !environment) {
        throw new Error('[IlluminationBakeExporter] Enabled IBL did not resolve an environment texture.');
    }
    const iblSource = environment?.userData?.iblHdrUrl ?? iblSettings?.hdrUrl ?? null;
    if (iblEnabled && !iblSource) {
        throw new Error('[IlluminationBakeExporter] Enabled IBL has no canonical HDR source.');
    }

    return {
        schema: ILLUMINATION_EXPORT_PROFILE_SCHEMA,
        id: `${city.cityId}.illumination-source.default-v1`,
        cityId: city.cityId,
        coordinateContract: 'three-y-up-to-blender-z-up-v1',
        colorContract: 'scene-linear-linear-srgb-v1',
        sourceSelection: {
            staticOnly: true,
            include: [
                'buildings',
                'roofs',
                'decorations',
                'roads',
                'curbs',
                'sidewalks',
                'terrain',
                'props',
                'traffic_controls',
                'trees_foliage'
            ],
            exclude: [
                'dynamic_bus',
                'lights_and_helpers',
                'sky_and_postprocessing',
                'debug_overlays',
                'derived_shadow_merge_meshes',
                'camera_color_pvs_state'
            ]
        },
        lightProfiles: [{
            id: 'sun.default',
            type: 'directional_sun',
            directionThree: [
                finite(sunDirection.x, 'sun.direction.x'),
                finite(sunDirection.y, 'sun.direction.y'),
                finite(sunDirection.z, 'sun.direction.z')
            ],
            colorLinearSrgb: colorArray(city.sunRef.color, 'sun.color'),
            intensity: finite(city.sunRef.intensity, 'sun.intensity'),
            angularDiameterDegrees: 0.53,
            filterModel: 'cycles_directional_soft_angle_v1'
        }, {
            id: 'hemisphere.current',
            type: 'hemisphere_diffuse',
            directionThree: [0, 1, 0],
            skyColorLinearSrgb: colorArray(city.hemi?.color, 'hemisphere.skyColor'),
            groundColorLinearSrgb: colorArray(city.hemi?.groundColor, 'hemisphere.groundColor'),
            intensity: finite(city.hemi?.intensity, 'hemisphere.intensity'),
            compositionPolicy: 'replace_current_diffuse_on_mapped_receivers'
        }, {
            id: 'environment.default',
            type: 'environment_ibl',
            enabled: iblEnabled,
            intensity: finite(iblSettings?.envMapIntensity ?? 0, 'ibl.envMapIntensity'),
            source: iblSource,
            sourceKind: environment ? 'resolved_runtime_environment' : 'none'
        }],
        channelConfigurations: {
            static_sun_depth: {
                schema: 'bus-sim-static-sun-depth-source-v1',
                lightProfileId: 'sun.default',
                geometryRole: 'static_casters',
                alphaPolicy: 'evaluated_runtime_coverage',
                depthUnits: 'meters',
                layout: { policy: 'full_city_single_domain_v1', resolution: 4096, paddingPixels: 8 },
                precision: 'float32_source_depth_v1',
                filtering: { model: 'cycles_directional_soft_angle_v1', samples: 128 },
                precisionOwner: 'AI_531'
            },
            direct_receiver: {
                schema: 'bus-sim-direct-receiver-source-v1',
                lightProfileIds: ['sun.default'],
                output: 'light_only_scene_linear_irradiance',
                receiverMapping: 'exported_stable_mapping_ids',
                layout: { policy: 'full_city_receiver_atlas_v1', resolution: 4096, paddingPixels: 8, dilationPixels: 8 },
                precision: 'float32_scene_linear_v1',
                unsupportedMaterialPolicy: 'exclude',
                sampling: { samples: 256, directLightSamples: 128, filterModel: 'cycles_directional_soft_angle_v1' },
                compilerOwner: 'AI_529_AI_533'
            },
            indirect_irradiance: {
                schema: 'bus-sim-indirect-irradiance-source-v1',
                lightProfileIds: ['sun.default', 'hemisphere.current', 'environment.default'],
                output: 'light_only_scene_linear_irradiance',
                bounceInputs: ['base_color', 'emissive', 'transmission_semantics'],
                runtimeComposition: {
                    diffusePolicy: 'replace_live_hemisphere_and_ibl_diffuse_on_mapped_receivers',
                    indirectSpecularPolicy: 'retain_live_environment_specular',
                    residualWeight: 0
                },
                layout: { policy: 'full_city_receiver_atlas_v1', resolution: 4096, paddingPixels: 8, dilationPixels: 8 },
                precision: 'float32_scene_linear_v1',
                unsupportedMaterialPolicy: 'exclude',
                sampling: { samples: 256, diffuseBounces: 4, glossyBounces: 0, transmissionBounces: 4 },
                compilerOwner: 'AI_529_AI_533'
            },
            static_ao_bent_normal: {
                schema: 'bus-sim-static-ao-source-v1',
                participatingGeometry: 'declared_static_geometry_and_alpha',
                receiverMapping: 'exported_stable_mapping_ids',
                radiusMeters: 5,
                distanceMeters: 5,
                rays: 128,
                samples: 128,
                sidedness: 'evaluated_material_side_and_shadow_side',
                output: { ambientOcclusion: true, bentNormal: true },
                layout: { policy: 'full_city_receiver_atlas_v1', resolution: 4096, paddingPixels: 8, dilationPixels: 8 },
                precision: 'float32_ao_and_xyz_bent_normal_v1',
                unsupportedMaterialPolicy: 'exclude',
                settingsOwner: 'AI_534'
            }
        },
        compilerReference: ILLUMINATION_COMPILER_REFERENCE
    };
}
