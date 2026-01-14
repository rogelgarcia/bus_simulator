// src/app/road_debugger/RoadDebuggerValidation.js
// Deterministic Road Debugger validation helpers (produces issues + optional quick fixes).

const EPS = 1e-9;

function compareString(a, b) {
    const aa = String(a ?? '');
    const bb = String(b ?? '');
    if (aa < bb) return -1;
    if (aa > bb) return 1;
    return 0;
}

function fnv1a32(str) {
    const s = String(str ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function stableHashId(prefix, key) {
    const hex = fnv1a32(key).toString(16).padStart(8, '0');
    return `${prefix}${hex}`;
}

function uniqSorted(ids) {
    const out = Array.from(new Set((ids ?? []).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())));
    out.sort(compareString);
    return out;
}

function distXZ(a, b) {
    const ax = Number(a?.x) || 0;
    const az = Number(a?.z) || 0;
    const bx = Number(b?.x) || 0;
    const bz = Number(b?.z) || 0;
    return Math.hypot(ax - bx, az - bz);
}

function centroidXZ(points) {
    const pts = Array.isArray(points) ? points : [];
    if (!pts.length) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    for (const p of pts) {
        x += Number(p?.x) || 0;
        z += Number(p?.z) || 0;
    }
    const inv = 1 / pts.length;
    return { x: x * inv, z: z * inv };
}

function buildIssue({
    issueId,
    severity,
    label,
    details = '',
    refs = {},
    primary = null,
    fixes = []
}) {
    return {
        issueId,
        severity,
        label,
        details: details ? String(details) : '',
        refs: {
            roadIds: uniqSorted(refs.roadIds ?? []),
            segmentIds: uniqSorted(refs.segmentIds ?? []),
            pointIds: uniqSorted(refs.pointIds ?? []),
            junctionIds: uniqSorted(refs.junctionIds ?? []),
            connectorIds: uniqSorted(refs.connectorIds ?? [])
        },
        primary: primary && typeof primary === 'object' ? primary : null,
        fixes: Array.isArray(fixes) ? fixes.filter(Boolean) : []
    };
}

function issueFix({ fixId, label, action }) {
    return {
        fixId,
        label: String(label ?? ''),
        action: action && typeof action === 'object' ? action : null
    };
}

function validateTrimOverlaps({ derived }) {
    const overlaps = Array.isArray(derived?.trim?.overlaps) ? derived.trim.overlaps : [];
    if (!overlaps.length) return [];

    const segments = Array.isArray(derived?.segments) ? derived.segments : [];
    const roadBySegmentId = new Map();
    for (const seg of segments) {
        if (seg?.id && seg?.roadId) roadBySegmentId.set(seg.id, seg.roadId);
    }

    const segmentIds = [];
    const roadIds = [];
    const overlapIds = [];
    for (const ov of overlaps) {
        if (!ov?.id) continue;
        overlapIds.push(ov.id);
        if (ov.aSegmentId) segmentIds.push(ov.aSegmentId);
        if (ov.bSegmentId) segmentIds.push(ov.bSegmentId);
        if (ov.aSegmentId) roadIds.push(roadBySegmentId.get(ov.aSegmentId) ?? null);
        if (ov.bSegmentId) roadIds.push(roadBySegmentId.get(ov.bSegmentId) ?? null);
    }

    const count = overlapIds.length;
    const detailList = uniqSorted(overlapIds).slice(0, 8);
    const details = detailList.length
        ? `overlaps: ${detailList.join(', ')}${count > detailList.length ? ` (+${count - detailList.length} more)` : ''}`
        : '';

    return [
        buildIssue({
            issueId: stableHashId('issue_', `trim_overlaps|${uniqSorted(overlapIds).join('|')}`),
            severity: 'warning',
            label: `Trim overlaps remain (${count})`,
            details,
            refs: {
                roadIds,
                segmentIds
            },
            primary: segmentIds.length ? { type: 'segment', segmentId: segmentIds[0] } : null
        })
    ];
}

function validateDroppedPieces({ derived }) {
    const segs = Array.isArray(derived?.segments) ? derived.segments : [];
    let count = 0;
    const segmentIds = [];
    const roadIds = [];
    for (const seg of segs) {
        const dropped = Array.isArray(seg?.droppedPieces) ? seg.droppedPieces : [];
        if (!dropped.length) continue;
        count += dropped.length;
        if (seg?.id) segmentIds.push(seg.id);
        if (seg?.roadId) roadIds.push(seg.roadId);
    }
    if (!count) return [];

    return [
        buildIssue({
            issueId: stableHashId('issue_', `dropped_pieces|${uniqSorted(segmentIds).join('|')}`),
            severity: 'info',
            label: `Dropped pieces (${count})`,
            details: 'Kept pieces shorter than the snap step (tileSize/10) are dropped.',
            refs: { roadIds, segmentIds },
            primary: segmentIds.length ? { type: 'segment', segmentId: segmentIds[0] } : null
        })
    ];
}

function validateSmallJunctions({ derived }) {
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    const issues = [];
    for (const junction of junctions) {
        const junctionId = junction?.id ?? null;
        if (!junctionId) continue;
        const endpoints = Array.isArray(junction?.endpoints) ? junction.endpoints : [];
        const count = endpoints.length;
        if (count >= 2) continue;

        const severity = count === 0 ? 'error' : 'warning';
        const label = `Junction has ${count} approach${count === 1 ? '' : 'es'}`;
        const details = `junction: ${junctionId}\nsource: ${junction?.source ?? '--'}\nendpoints: ${count}`;
        issues.push(buildIssue({
            issueId: stableHashId('issue_', `junction_small|${junctionId}`),
            severity,
            label,
            details,
            refs: {
                junctionIds: [junctionId],
                roadIds: junction?.roadIds ?? [],
                segmentIds: junction?.segmentIds ?? []
            },
            primary: { type: 'junction', junctionId },
            fixes: [
                issueFix({
                    fixId: stableHashId('fix_', `delete_junction|${junctionId}`),
                    label: 'Delete / suppress junction',
                    action: { type: 'delete_junction', junctionId }
                })
            ]
        }));
    }
    issues.sort((a, b) => compareString(a?.issueId, b?.issueId));
    return issues;
}

function validateDanglingEndpointClusters({ derived }) {
    const settings = derived?.settings ?? {};
    const laneWidth = Number(settings?.laneWidth) || 4.8;
    const defaultThreshold = laneWidth * 1.5;
    const threshold = Math.max(0, Number(settings?.junctions?.minThreshold) || defaultThreshold);
    const endpointCandidates = Array.isArray(derived?.junctionCandidates?.endpoints)
        ? derived.junctionCandidates.endpoints
        : [];

    const inJunction = new Set();
    const junctions = Array.isArray(derived?.junctions) ? derived.junctions : [];
    for (const junction of junctions) {
        for (const cid of junction?.candidateIds ?? []) {
            if (typeof cid === 'string' && cid.trim()) inJunction.add(cid.trim());
        }
    }

    const loose = endpointCandidates
        .filter((ep) => ep?.id && ep?.world && !inJunction.has(ep.id))
        .map((ep) => ({
            id: ep.id,
            roadId: ep.roadId ?? null,
            segmentId: ep.segmentId ?? null,
            world: { x: Number(ep.world.x) || 0, z: Number(ep.world.z) || 0 }
        }))
        .sort((a, b) => compareString(a?.id, b?.id));

    const visited = new Set();
    const issues = [];
    for (const ep of loose) {
        if (!ep?.id || visited.has(ep.id)) continue;
        visited.add(ep.id);

        const cluster = [ep];
        for (const other of loose) {
            if (!other?.id || visited.has(other.id)) continue;
            if (distXZ(ep.world, other.world) <= threshold + EPS) {
                visited.add(other.id);
                cluster.push(other);
            }
        }

        if (cluster.length < 2) continue;
        const candidateIds = uniqSorted(cluster.map((c) => c.id));
        const roadIds = uniqSorted(cluster.map((c) => c.roadId));
        const segmentIds = uniqSorted(cluster.map((c) => c.segmentId));
        const center = centroidXZ(cluster.map((c) => c.world));

        issues.push(buildIssue({
            issueId: stableHashId('issue_', `dangling_endpoints|${candidateIds.join('|')}`),
            severity: 'warning',
            label: `Dangling endpoints (${candidateIds.length})`,
            details: `threshold: ${threshold.toFixed(2)}m\ncenter: ${center.x.toFixed(1)}, ${center.z.toFixed(1)}\ncandidates: ${candidateIds.join(', ')}`,
            refs: { roadIds, segmentIds },
            primary: segmentIds.length ? { type: 'segment', segmentId: segmentIds[0] } : (roadIds.length ? { type: 'road', roadId: roadIds[0] } : null),
            fixes: [
                issueFix({
                    fixId: stableHashId('fix_', `create_junction|${candidateIds.join('|')}`),
                    label: 'Create junction',
                    action: { type: 'create_manual_junction', candidateIds }
                })
            ]
        }));
    }

    issues.sort((a, b) => compareString(a?.issueId, b?.issueId));
    return issues;
}

export function validateRoadDebuggerIssues(derived) {
    const issues = [];
    if (!derived || typeof derived !== 'object') return issues;

    issues.push(...validateTrimOverlaps({ derived }));
    issues.push(...validateSmallJunctions({ derived }));
    issues.push(...validateDanglingEndpointClusters({ derived }));
    issues.push(...validateDroppedPieces({ derived }));

    issues.sort((a, b) => compareString(a?.issueId, b?.issueId));
    return issues;
}

