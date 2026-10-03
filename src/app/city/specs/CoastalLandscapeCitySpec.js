// Retains an explicitly bound coastal planning subregion with existing parcel ownership.
// @ts-check
export function createCoastalLandscapeCitySpec() {
    return {
        version: 1, seed: 'coastal-reference-plan', width: 21, height: 17, tileSize: 24,
        origin: { x: -988, z: -188 },
        landscape: {
            format: 'city-landscape-binding', schemaVersion: 1, landscapeId: 'coastal-city',
            manifestUrl: 'assets/public/landscape/coastal-city/manifest.58fc747102857c7d2b05c0aa991604d958379a4065e709ca3c1da4438b26f7b4.json',
            revision: 'hierarchy-afaf934f8eb8fe074a0affb0',
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
