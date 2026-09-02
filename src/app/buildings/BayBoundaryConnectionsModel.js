// Stable, array-index-free model for opt-in connections between adjacent bay endpoints.
// @ts-check

export const BAY_BOUNDARY_EDGE = Object.freeze({ START: 'start', END: 'end' });
export const BAY_BOUNDARY_TYPE = Object.freeze({ SHARP: 'sharp', ROUNDED: 'rounded' });
export const BAY_BOUNDARY_STATION_MODE = Object.freeze({ CENTERED: 'centered', AUTHORED: 'authored' });

const VALID_EDGES = Object.freeze(Object.values(BAY_BOUNDARY_EDGE));
const VALID_TYPES = Object.freeze(Object.values(BAY_BOUNDARY_TYPE));
const VALID_STATION_MODES = Object.freeze(Object.values(BAY_BOUNDARY_STATION_MODE));

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value, mode = '') {
    const out = typeof value === 'string' ? value.trim() : '';
    if (mode === 'upper') return out.toUpperCase();
    if (mode === 'lower') return out.toLowerCase();
    return out;
}

function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeEndpoint(value) {
    const source = isObject(value) ? value : {};
    return {
        faceId: text(source.faceId, 'upper'),
        bayId: text(source.bayId),
        edge: text(source.edge, 'lower')
    };
}

function normalizeDepthLink(value) {
    const source = isObject(value) ? value : null;
    if (!source) return null;
    const enabled = !!source.enabled;
    return enabled
        ? { enabled: true, valueMeters: finiteOr(source.valueMeters, 0) }
        : { enabled: false };
}

function normalizeTransition(value) {
    const source = isObject(value) ? value : {};
    const mode = text(source.mode, 'lower') || BAY_BOUNDARY_STATION_MODE.CENTERED;
    const left = finiteOr(source.leftRunoutMeters, 0.75);
    const linked = source.runoutsLinked === undefined
        ? mode === BAY_BOUNDARY_STATION_MODE.CENTERED
        : !!source.runoutsLinked;
    return {
        mode,
        leftRunoutMeters: left,
        rightRunoutMeters: linked ? left : finiteOr(source.rightRunoutMeters, 0.75),
        runoutsLinked: linked,
        meeting: finiteOr(source.meeting, 0.5)
    };
}

function normalizeConnection(value) {
    const source = isObject(value) ? value : {};
    const type = text(source.type, 'lower') || BAY_BOUNDARY_TYPE.SHARP;
    const depthLink = normalizeDepthLink(source.depthLink);
    return {
        id: text(source.id),
        type,
        endpoints: (Array.isArray(source.endpoints) ? source.endpoints : []).map(normalizeEndpoint),
        ...(depthLink ? { depthLink } : {}),
        ...(type === BAY_BOUNDARY_TYPE.ROUNDED ? { transition: normalizeTransition(source.transition) } : {})
    };
}

function isFaceId(value) {
    return typeof value === 'string' && value.length === 1 && value >= 'A' && value <= 'Z';
}

function diagnostic(code, message, { connectionId = null, connectionIndex = null, endpointIndex = null } = {}) {
    return {
        severity: 'error',
        code,
        message,
        ...(connectionId ? { connectionId } : {}),
        ...(Number.isInteger(connectionIndex) ? { connectionIndex } : {}),
        ...(Number.isInteger(endpointIndex) ? { endpointIndex } : {})
    };
}

function hasStructuralError(diagnostics, connectionIndex) {
    return diagnostics.some((entry) => entry.connectionIndex === connectionIndex);
}

/** Canonicalizes the optional layer relationship block. Absence remains default-off. */
export function normalizeBayBoundaryConnectionsConfig(value) {
    const source = isObject(value) ? value : null;
    if (!source || !Array.isArray(source.connections) || !source.connections.length) return null;
    return { connections: source.connections.map(normalizeConnection) };
}

/** Returns a collision-safe identity for one valid physical facade endpoint. */
export function bayBoundaryEndpointKey(value) {
    const endpoint = normalizeEndpoint(value);
    if (!isFaceId(endpoint.faceId) || !endpoint.bayId || !VALID_EDGES.includes(endpoint.edge)) return null;
    return JSON.stringify([endpoint.faceId, endpoint.bayId, endpoint.edge]);
}

/** Validates identity, exclusive endpoint ownership, and authored parameters. */
export function validateBayBoundaryConnectionsConfig(value) {
    const config = normalizeBayBoundaryConnectionsConfig(value);
    if (!config) return { valid: true, config: null, diagnostics: [] };

    const rawConnections = isObject(value) && Array.isArray(value.connections)
        ? value.connections
        : [];
    const diagnostics = [];
    const ids = new Map();
    config.connections.forEach((connection, connectionIndex) => {
        const rawConnection = isObject(rawConnections[connectionIndex]) ? rawConnections[connectionIndex] : {};
        const context = { connectionId: connection.id || null, connectionIndex };
        if (!connection.id) {
            diagnostics.push(diagnostic('bay_boundary_connection_id_missing', 'Bay-boundary connections require a stable, non-empty id.', context));
        } else {
            if (!ids.has(connection.id)) ids.set(connection.id, []);
            ids.get(connection.id).push(context);
        }
        if (!VALID_TYPES.includes(connection.type)) {
            diagnostics.push(diagnostic('bay_boundary_type_invalid', `Connection "${connection.id || connectionIndex + 1}" must use type "sharp" or "rounded".`, context));
        }
        if (connection.endpoints.length !== 2) {
            diagnostics.push(diagnostic('bay_boundary_endpoint_count_invalid', `Connection "${connection.id || connectionIndex + 1}" must have exactly two endpoints.`, context));
        }
        connection.endpoints.forEach((endpoint, endpointIndex) => {
            const endpointContext = { ...context, endpointIndex };
            if (!isFaceId(endpoint.faceId)) diagnostics.push(diagnostic('bay_boundary_face_id_invalid', 'A bay-boundary endpoint requires a physical face id from A to Z.', endpointContext));
            if (!endpoint.bayId) diagnostics.push(diagnostic('bay_boundary_bay_id_missing', 'A bay-boundary endpoint requires a stable source bay id.', endpointContext));
            if (!VALID_EDGES.includes(endpoint.edge)) diagnostics.push(diagnostic('bay_boundary_edge_invalid', 'A bay-boundary endpoint edge must be "start" or "end".', endpointContext));
        });
        if (connection.endpoints.length === 2
            && connection.endpoints[0].faceId === connection.endpoints[1].faceId
            && connection.endpoints[0].edge === connection.endpoints[1].edge) {
            diagnostics.push(diagnostic('bay_boundary_orientation_invalid', 'Adjacent bay boundaries must connect one "end" endpoint to one "start" endpoint.', context));
        }
        if (connection.depthLink?.enabled
            && (!Number.isFinite(Number(rawConnection?.depthLink?.valueMeters)))) {
            diagnostics.push(diagnostic('bay_boundary_depth_link_value_invalid', 'A linked boundary depth requires a finite value in meters.', context));
        }
        if (connection.type === BAY_BOUNDARY_TYPE.ROUNDED) {
            const transition = connection.transition;
            const rawTransition = isObject(rawConnection.transition) ? rawConnection.transition : {};
            if (!VALID_STATION_MODES.includes(transition?.mode)) {
                diagnostics.push(diagnostic('bay_boundary_station_mode_invalid', 'A rounded boundary must use centered or authored station mode.', context));
            }
            const rawLeft = rawTransition.leftRunoutMeters === undefined
                ? transition?.leftRunoutMeters : Number(rawTransition.leftRunoutMeters);
            const rawRight = rawTransition.rightRunoutMeters === undefined
                ? transition?.rightRunoutMeters : Number(rawTransition.rightRunoutMeters);
            if (!Number.isFinite(rawLeft) || !Number.isFinite(rawRight) || !(rawLeft > 0) || !(rawRight > 0)) {
                diagnostics.push(diagnostic('bay_boundary_runout_invalid', 'Rounded boundary runouts must both be greater than zero meters.', context));
            }
            const rawMeeting = rawTransition.meeting === undefined
                ? transition?.meeting : Number(rawTransition.meeting);
            if (!Number.isFinite(rawMeeting) || !(rawMeeting > 0) || !(rawMeeting < 1)) {
                diagnostics.push(diagnostic('bay_boundary_meeting_invalid', 'Rounded boundary meeting position must be greater than 0 and less than 1.', context));
            }
        }
    });

    for (const [id, occurrences] of ids) {
        if (occurrences.length < 2) continue;
        for (const occurrence of occurrences) {
            diagnostics.push(diagnostic('bay_boundary_connection_id_duplicate', `Bay-boundary connection id "${id}" is duplicated; every duplicate is disabled.`, occurrence));
        }
    }

    const owners = new Map();
    config.connections.forEach((connection, connectionIndex) => {
        if (hasStructuralError(diagnostics, connectionIndex)) return;
        connection.endpoints.forEach((endpoint, endpointIndex) => {
            const key = bayBoundaryEndpointKey(endpoint);
            if (!key) return;
            if (!owners.has(key)) owners.set(key, []);
            owners.get(key).push({ connectionId: connection.id, connectionIndex, endpointIndex, endpoint });
        });
    });
    for (const occurrences of owners.values()) {
        if (occurrences.length < 2) continue;
        const names = occurrences.map((entry) => `"${entry.connectionId}"`).join(', ');
        for (const occurrence of occurrences) {
            diagnostics.push(diagnostic(
                'bay_boundary_endpoint_already_owned',
                `Endpoint ${occurrence.endpoint.faceId}:${occurrence.endpoint.bayId}:${occurrence.endpoint.edge} has competing owners ${names}; every competing connection is disabled.`,
                occurrence
            ));
        }
    }
    return { valid: diagnostics.length === 0, config, diagnostics };
}

function stripStart(strip) {
    const value = Number(strip?.frontU0);
    return Number.isFinite(value) ? value : Number(strip?.u0) || 0;
}

function stripEnd(strip) {
    const value = Number(strip?.frontU1);
    return Number.isFinite(value) ? value : Number(strip?.u1) || 0;
}

function matchesForEndpoint(endpoint, stripsByFaceId) {
    const strips = Array.isArray(stripsByFaceId?.[endpoint.faceId]) ? stripsByFaceId[endpoint.faceId] : [];
    return strips.filter((strip) => strip?.faceId === endpoint.faceId && strip?.sourceBayId === endpoint.bayId);
}

function resolveSameFaceInstances(endpoints, matchesA, matchesB) {
    const endIndex = endpoints[0].edge === BAY_BOUNDARY_EDGE.END ? 0 : 1;
    const startIndex = 1 - endIndex;
    const endMatches = endIndex === 0 ? matchesA : matchesB;
    const startMatches = startIndex === 0 ? matchesA : matchesB;
    const pairs = [];
    for (const left of endMatches) {
        for (const right of startMatches) {
            if (Math.abs(stripEnd(left) - stripStart(right)) > 1e-4) continue;
            const resolved = [];
            resolved[endIndex] = { ...endpoints[endIndex], strip: left };
            resolved[startIndex] = { ...endpoints[startIndex], strip: right };
            pairs.push({ endpoints: resolved });
        }
    }
    pairs.sort((a, b) => stripEnd(a.endpoints[endIndex].strip) - stripEnd(b.endpoints[endIndex].strip));
    return pairs;
}

function facesAreAdjacent(faceA, faceB, faceOrder) {
    const order = Array.isArray(faceOrder) ? faceOrder : [];
    const a = order.indexOf(faceA);
    const b = order.indexOf(faceB);
    if (a < 0 || b < 0 || order.length < 2) return false;
    return (a + 1) % order.length === b || (b + 1) % order.length === a;
}

function resolveCrossFaceInstance(endpoints, matchesA, matchesB, faceOrder) {
    if (!facesAreAdjacent(endpoints[0].faceId, endpoints[1].faceId, faceOrder)) return [];
    const choose = (endpoint, matches) => matches.slice().sort((a, b) => (
        endpoint.edge === BAY_BOUNDARY_EDGE.START
            ? stripStart(a) - stripStart(b)
            : stripEnd(b) - stripEnd(a)
    ))[0] ?? null;
    const a = choose(endpoints[0], matchesA);
    const b = choose(endpoints[1], matchesB);
    return a && b ? [{ endpoints: [{ ...endpoints[0], strip: a }, { ...endpoints[1], strip: b }] }] : [];
}

/** Resolves canonical relationships to every physically adjacent repeated strip pair. */
export function resolveBayBoundaryConnections({ connections, stripsByFaceId, faceOrder = [] } = {}) {
    const structural = validateBayBoundaryConnectionsConfig(connections);
    if (!structural.config) return { valid: structural.valid, connections: [], diagnostics: structural.diagnostics };
    const diagnostics = [...structural.diagnostics];
    const resolved = [];

    structural.config.connections.forEach((connection, connectionIndex) => {
        if (hasStructuralError(structural.diagnostics, connectionIndex)) return;
        const [a, b] = connection.endpoints;
        const matchesA = matchesForEndpoint(a, stripsByFaceId);
        const matchesB = matchesForEndpoint(b, stripsByFaceId);
        const context = { connectionId: connection.id, connectionIndex };
        if (!matchesA.length || !matchesB.length) {
            diagnostics.push(diagnostic('bay_boundary_endpoint_missing', `Connection "${connection.id}" cannot find both physical bay endpoints.`, context));
            return;
        }
        const instances = a.faceId === b.faceId
            ? resolveSameFaceInstances(connection.endpoints, matchesA, matchesB)
            : resolveCrossFaceInstance(connection.endpoints, matchesA, matchesB, faceOrder);
        if (!instances.length) {
            diagnostics.push(diagnostic('bay_boundary_endpoints_not_adjacent', `Connection "${connection.id}" endpoints are not consecutive in the solved physical facade.`, context));
            return;
        }
        resolved.push({ ...connection, instances });
    });
    return { valid: diagnostics.length === 0, connections: resolved, diagnostics };
}
