# Building Fabrication 2 — Serialized Schema Addendum

Status: **Implemented through AI 541**

This addendum records concrete schemas whose exact serialized form is relied
upon by normalization, export/import, catalog configs, undo/redo, and tests.

## AI 541 bay-boundary connections

The optional block belongs to a floor layer:

~~~js
bayBoundaryConnections: {
    connections: [{
        id: 'stable_connection_id',
        type: 'sharp' | 'rounded',
        endpoints: [
            { faceId: 'A', bayId: 'stable_source_bay_id', edge: 'start' | 'end' },
            { faceId: 'B', bayId: 'stable_source_bay_id', edge: 'start' | 'end' }
        ],
        depthLink: { enabled: false }
            | { enabled: true, valueMeters: 0.35 },
        transition: { // rounded only
            mode: 'centered' | 'authored',
            leftRunoutMeters: 0.75,
            rightRunoutMeters: 0.75,
            runoutsLinked: true,
            meeting: 0.5
        }
    }]
}
~~~

Absence, null, or an empty connection list normalizes to no field and preserves
legacy geometry exactly. Left/right and Start/End are defined in each physical
face's resolved local-u direction. The depth link is cross-bay and must never
replace either bay's existing within-bay depth.linked setting.

Ids and endpoint ownership are unique. Relationships resolve by physical
faceId + source bay id + edge, never an array index. Repeats may produce
multiple instances only when the resolved source-bay occurrences are physically
consecutive. Reversal flips the affected endpoint edge and preserves all
transition/depth-link values.
