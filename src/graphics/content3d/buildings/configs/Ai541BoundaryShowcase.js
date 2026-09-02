// AI 541 paired showcase: identical building data with only bay-boundary
// connection type changing between the sharp and rounded catalog variants.

const PRIMARY_WINDOW = Object.freeze({
    enabled: true,
    defId: 'window_white_sash_2x2',
    assetType: 'window',
    size: { widthMeters: 1.5, heightMeters: 1.8 },
    heightMode: 'fixed',
    verticalOffsetMeters: 0.85,
    width: { minMeters: 1.5, maxMeters: null },
    padding: { leftMeters: 0.15, rightMeters: 0.15 },
    repeat: { count: 1 },
    muntins: { bottomEnabled: true, topEnabled: true },
    visual: { disableShades: false, interior: 'res' },
    top: { enabled: false },
    garageFacade: null,
    wall: { cutWidthLerp: 0, cutHeightLerp: 0 }
});

const CONNECTION_SPECS = Object.freeze([
    Object.freeze({
        id: 'same_face_depth_step',
        endpoints: Object.freeze([
            Object.freeze({ faceId: 'A', bayId: 'step_left', edge: 'end' }),
            Object.freeze({ faceId: 'A', bayId: 'step_right', edge: 'start' })
        ]),
        transition: Object.freeze({
            mode: 'centered',
            leftRunoutMeters: 0.8,
            rightRunoutMeters: 0.8,
            runoutsLinked: true,
            meeting: 0.5
        })
    }),
    Object.freeze({
        id: 'equal_depth_tangent_kink',
        endpoints: Object.freeze([
            Object.freeze({ faceId: 'A', bayId: 'kink_left', edge: 'end' }),
            Object.freeze({ faceId: 'A', bayId: 'kink_right', edge: 'start' })
        ]),
        transition: Object.freeze({
            mode: 'centered',
            leftRunoutMeters: 0.7,
            rightRunoutMeters: 0.7,
            runoutsLinked: true,
            meeting: 0.5
        })
    }),
    Object.freeze({
        id: 'asymmetric_depth_step',
        endpoints: Object.freeze([
            Object.freeze({ faceId: 'A', bayId: 'asym_left', edge: 'end' }),
            Object.freeze({ faceId: 'A', bayId: 'corner_front', edge: 'start' })
        ]),
        transition: Object.freeze({
            mode: 'authored',
            leftRunoutMeters: 0.55,
            rightRunoutMeters: 1.15,
            runoutsLinked: false,
            meeting: 0.32
        })
    }),
    Object.freeze({
        id: 'rounded_cross_face_corner',
        endpoints: Object.freeze([
            Object.freeze({ faceId: 'A', bayId: 'corner_front', edge: 'end' }),
            Object.freeze({ faceId: 'B', bayId: 'corner_side', edge: 'start' })
        ]),
        depthLink: Object.freeze({ enabled: true, valueMeters: 0.45 }),
        transition: Object.freeze({
            mode: 'centered',
            leftRunoutMeters: 1,
            rightRunoutMeters: 1,
            runoutsLinked: true,
            meeting: 0.5
        })
    })
]);

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

function bay(id, depth, materialSlot) {
    return {
        id,
        size: { mode: 'fixed', widthMeters: 4 },
        expandPreference: 'prefer_expand',
        depth: { ...depth },
        wallMaterialOverride: { kind: 'slot', id: materialSlot },
        window: { ...PRIMARY_WINDOW }
    };
}

function buildConnections(type) {
    return {
        connections: CONNECTION_SPECS.map((entry) => ({
            id: entry.id,
            type,
            endpoints: entry.endpoints.map((endpoint) => ({ ...endpoint })),
            depthLink: entry.depthLink ? { ...entry.depthLink } : { enabled: false },
            transition: { ...entry.transition }
        }))
    };
}

function buildShowcaseConfig(type) {
    const rounded = type === 'rounded';
    const suffix = rounded ? 'rounded' : 'sharp';
    return deepFreeze({
        id: `ai541_boundary_showcase_${suffix}`,
        name: `AI 541 Boundary Showcase — ${rounded ? 'Rounded' : 'Sharp'}`,
        materialSlots: {
            slots: {
                wallPrimary: { material: { kind: 'texture', id: 'pbr.limestone_smooth' } },
                warm: { material: { kind: 'preset', id: 'brick.red_standard', jitter: true } },
                cool: { material: { kind: 'texture', id: 'pbr.seaworn_sandstone_brick' } },
                trim: { material: { kind: 'color', id: 'offwhite' } }
            }
        },
        layers: [
            {
                id: 'showcase_floor',
                type: 'floor',
                floors: 4,
                floorHeight: 3.15,
                planOffset: 0,
                interior: { enabled: true },
                style: 'default',
                material: { kind: 'slot', id: 'wallPrimary' },
                belt: {
                    enabled: true,
                    height: 0.14,
                    extrusion: 0.06,
                    material: { kind: 'slot', id: 'trim' }
                },
                windows: { enabled: false },
                bayBoundaryConnections: buildConnections(type)
            },
            {
                id: 'showcase_roof',
                type: 'roof',
                ring: {
                    enabled: true,
                    innerRadius: 0.22,
                    outerRadius: 0.18,
                    height: 0.55,
                    material: { kind: 'slot', id: 'wallPrimary' }
                },
                cornice: {
                    enabled: true,
                    profile: 'stepped',
                    height: 0.42,
                    projection: 0.22,
                    material: { kind: 'slot', id: 'trim' },
                    ornament: { type: 'none' },
                    parapet: { coping: { enabled: true, height: 0.1, overhang: 0.04 } }
                },
                roof: {
                    type: 'Asphalt',
                    material: { kind: 'texture', id: 'pbr.rough_concrete' }
                }
            }
        ],
        footprintLoops: [[
            { x: -12, z: 6, cornerId: 'showcase_nw', runId: 'A', runForward: true },
            { x: 12, z: 6, cornerId: 'showcase_ne', runId: 'B', runForward: true },
            { x: 12, z: -6, cornerId: 'showcase_se', runId: 'C', runForward: true },
            { x: -12, z: -6, cornerId: 'showcase_sw', runId: 'D', runForward: true }
        ]],
        floors: 4,
        floorHeight: 3.15,
        style: 'default',
        windows: null,
        facades: {
            showcase_floor: {
                A: {
                    layout: {
                        bays: {
                            items: [
                                bay('step_left', { left: 0.85, right: 0.85, linked: true }, 'warm'),
                                bay('step_right', { left: -0.35, right: -0.35, linked: true }, 'cool'),
                                bay('kink_left', { left: -0.35, right: 0.45, linked: false }, 'warm'),
                                bay('kink_right', { left: 0.45, right: -0.35, linked: false }, 'cool'),
                                bay('asym_left', { left: -0.35, right: -0.35, linked: true }, 'warm'),
                                bay('corner_front', { left: 0.75, right: 0.45, linked: false }, 'cool')
                            ],
                            nextBayIndex: 7
                        },
                        groups: { items: [], nextGroupIndex: 1 }
                    }
                },
                B: {
                    layout: {
                        bays: {
                            items: [
                                {
                                    id: 'corner_side',
                                    size: { mode: 'range', minMeters: 12, maxMeters: null },
                                    expandPreference: 'prefer_expand',
                                    depth: { left: 0.45, right: 0.45, linked: true },
                                    wallMaterialOverride: { kind: 'slot', id: 'warm' },
                                    window: { ...PRIMARY_WINDOW, repeat: { count: 4 } }
                                }
                            ],
                            nextBayIndex: 2
                        },
                        groups: { items: [], nextGroupIndex: 1 }
                    }
                }
            }
        }
    });
}

export const AI541_BOUNDARY_SHOWCASE_SHARP_CONFIG = buildShowcaseConfig('sharp');
export const AI541_BOUNDARY_SHOWCASE_ROUNDED_CONFIG = buildShowcaseConfig('rounded');
