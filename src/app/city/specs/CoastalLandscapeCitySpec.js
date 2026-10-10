// Retains an explicitly bound coastal planning subregion with existing parcel ownership.
// The pinned manifest lives in the local, gitignored landscape cache; without it the city reports the landscape unavailable (AI 595).
// AI 596 D4 re-pinned the binding from the imported coastal v2 (`coastal-city`, hierarchy-afaf934…) to the synthesized coastal terrain v3
// (`coastal-city-v3`, 4097² at 0.9765625 m): a new native grid is a new landscape id, pinned at the immutable snapshot its synthesis leaf
// wrote. v2 stays immutable under its own id as the viewer/server default. Transform and extent are unchanged (bounds stay 0..4000).
// @ts-check
export function createCoastalLandscapeCitySpec() {
    return {
        version: 1, seed: 'coastal-reference-plan', width: 21, height: 17, tileSize: 24,
        origin: { x: -988, z: -188 },
        landscape: {
            format: 'city-landscape-binding', schemaVersion: 1, landscapeId: 'coastal-city-v3',
            manifestUrl: 'assets/public/landscape/coastal-city-v3/manifest.3846aed4c17a7125df21eab7f3b486eff82daa2e5e0f3fc0ab084dc02689e9ef.json',
            revision: 'synthesis-7045f619de9de74a367bc3a8',
            transform: { translation: { x: -2000, y: 0, z: -2000 }, yawDegrees: 0, scale: 1 },
            extent: { minX: 1000, maxX: 1500, minZ: 1800, maxZ: 2200 },
            capabilities: ['landscape-reference-v1']
        },
        roads: [],
        buildings: [{
            id: 'coastal-planning-parcel', configId: 'burban',
            tiles: [[5, 5], [6, 5], [5, 6], [6, 6]],
            placement: { front: 'south', padding: 2, align: 'center' }
        }],
        reservations: [{
            id: 'coastal-bus-start', type: 'bus_start', squares: [[10, 5], [10, 6]],
            size: { width: 5.2, depth: 14 }, clearance: 1.5,
            placement: { front: 'south', padding: 2, align: 'center' }
        }]
    };
}
