// Stable, array-index-free model for optional balcony joins across authored facade bays.
// @ts-check

import { normalizeBalconyConfig } from './BayBalconyModel.js';

export const BALCONY_CONTINUITY_EDGE = Object.freeze({
    START: 'start',
    END: 'end'
});

export const BALCONY_CONTINUITY_EDGE_IDS = Object.freeze([
    BALCONY_CONTINUITY_EDGE.START,
    BALCONY_CONTINUITY_EDGE.END
]);

export const BALCONY_CONTINUITY_CORNER_TRANSITION = Object.freeze({
    ROUNDED: 'rounded'
});

const BALCONY_CONTINUITY_CORNER_TRANSITION_IDS = Object.freeze(
    Object.values(BALCONY_CONTINUITY_CORNER_TRANSITION)
);

function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizedString(value, { uppercase = false, lowercase = false } = {}) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (uppercase) return text.toUpperCase();
    if (lowercase) return text.toLowerCase();
    return text;
}

function normalizeEndpoint(value) {
    const src = isObject(value) ? value : {};
    return {
        faceId: normalizedString(src.faceId, { uppercase: true }),
        bayId: normalizedString(src.bayId),
        edge: normalizedString(src.edge, { lowercase: true })
    };
}

function finiteOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeCornerTransition(value) {
    const src = isObject(value) ? value : null;
    if (!src) return null;
    const left = finiteOr(src.leftRunoutMeters, 0.75);
    const linked = src.runoutsLinked === undefined ? true : !!src.runoutsLinked;
    return {
        type: normalizedString(src.type, { lowercase: true }) || BALCONY_CONTINUITY_CORNER_TRANSITION.ROUNDED,
        leftRunoutMeters: left,
        rightRunoutMeters: linked ? left : finiteOr(src.rightRunoutMeters, 0.75),
        runoutsLinked: linked,
        meeting: finiteOr(src.meeting, 0.5)
    };
}

function normalizeLink(value) {
    const src = isObject(value) ? value : {};
    const cornerTransition = normalizeCornerTransition(src.cornerTransition);
    return {
        id: normalizedString(src.id),
        endpoints: (Array.isArray(src.endpoints) ? src.endpoints : []).map(normalizeEndpoint),
        ...(cornerTransition ? { cornerTransition } : {})
    };
}

function isFaceId(value) {
    return typeof value === 'string' && value.length === 1 && value >= 'A' && value <= 'Z';
}

function isEdge(value) {
    return BALCONY_CONTINUITY_EDGE_IDS.includes(value);
}

function diagnostic(code, message, { linkId = null, linkIndex = null, endpointIndex = null } = {}) {
    return {
        severity: 'error',
        code,
        message,
        ...(linkId ? { linkId } : {}),
        ...(Number.isInteger(linkIndex) ? { linkIndex } : {}),
        ...(Number.isInteger(endpointIndex) ? { endpointIndex } : {})
    };
}

function linkHasStructuralError(diagnostics, linkIndex) {
    return diagnostics.some((entry) => entry.linkIndex === linkIndex);
}

function allSolvedStrips(stripsByFaceId) {
    if (!isObject(stripsByFaceId)) return [];
    const out = [];
    const seen = new Set();
    for (const strips of Object.values(stripsByFaceId)) {
        if (!Array.isArray(strips)) continue;
        for (const strip of strips) {
            if (!isObject(strip) || seen.has(strip)) continue;
            seen.add(strip);
            out.push(strip);
        }
    }
    return out;
}

/**
 * Canonicalizes a floor layer's optional continuity block. Invalid authored
 * records remain representable so validation can report them without losing
 * editor intent. Empty/absent blocks return null and therefore stay default-off.
 */
export function normalizeBalconyContinuityConfig(value) {
    const src = isObject(value) ? value : null;
    if (!src || !Array.isArray(src.links) || !src.links.length) return null;
    return { links: src.links.map(normalizeLink) };
}

/** Returns a collision-safe identity for one valid physical facade endpoint. */
export function balconyContinuityEndpointKey(value) {
    const endpoint = normalizeEndpoint(value);
    if (!isFaceId(endpoint.faceId) || !endpoint.bayId || !isEdge(endpoint.edge)) return null;
    return JSON.stringify([endpoint.faceId, endpoint.bayId, endpoint.edge]);
}

/** Validates link identity and exclusive ownership without resolving geometry. */
export function validateBalconyContinuityConfig(value) {
    const config = normalizeBalconyContinuityConfig(value);
    if (!config) return { valid: true, config: null, diagnostics: [] };

    const rawLinks = isObject(value) && Array.isArray(value.links) ? value.links : [];
    const diagnostics = [];
    const linkOccurrencesById = new Map();

    config.links.forEach((link, linkIndex) => {
        const rawLink = isObject(rawLinks[linkIndex]) ? rawLinks[linkIndex] : {};
        const linkId = link.id || null;
        if (!link.id) {
            diagnostics.push(diagnostic(
                'balcony_continuity_link_id_missing',
                'Balcony continuity links require a stable, non-empty id.',
                { linkIndex }
            ));
        } else {
            if (!linkOccurrencesById.has(link.id)) linkOccurrencesById.set(link.id, []);
            linkOccurrencesById.get(link.id).push({ linkId: link.id, linkIndex });
        }

        if (link.endpoints.length !== 2) {
            diagnostics.push(diagnostic(
                'balcony_continuity_endpoint_count_invalid',
                `Balcony continuity link "${link.id || linkIndex + 1}" must have exactly two endpoints.`,
                { linkId, linkIndex }
            ));
        }

        link.endpoints.forEach((endpoint, endpointIndex) => {
            if (!isFaceId(endpoint.faceId)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_face_id_invalid',
                    `Endpoint ${endpointIndex + 1} of link "${link.id || linkIndex + 1}" requires a physical face id from A to Z.`,
                    { linkId, linkIndex, endpointIndex }
                ));
            }
            if (!endpoint.bayId) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_bay_id_missing',
                    `Endpoint ${endpointIndex + 1} of link "${link.id || linkIndex + 1}" requires a stable source bay id.`,
                    { linkId, linkIndex, endpointIndex }
                ));
            }
            if (!isEdge(endpoint.edge)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_edge_invalid',
                    `Endpoint ${endpointIndex + 1} of link "${link.id || linkIndex + 1}" must use edge "start" or "end".`,
                    { linkId, linkIndex, endpointIndex }
                ));
            }
        });

        if (link.cornerTransition) {
            const context = { linkId, linkIndex };
            const rawTransition = isObject(rawLink.cornerTransition) ? rawLink.cornerTransition : {};
            if (!BALCONY_CONTINUITY_CORNER_TRANSITION_IDS.includes(link.cornerTransition.type)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_corner_transition_type_invalid',
                    `Balcony continuity link "${link.id || linkIndex + 1}" must use corner transition type "rounded".`,
                    context
                ));
            }
            const rawLeft = rawTransition.leftRunoutMeters === undefined
                ? link.cornerTransition.leftRunoutMeters
                : Number(rawTransition.leftRunoutMeters);
            const rawRight = rawTransition.rightRunoutMeters === undefined
                ? link.cornerTransition.rightRunoutMeters
                : Number(rawTransition.rightRunoutMeters);
            if (!Number.isFinite(rawLeft) || !Number.isFinite(rawRight) || !(rawLeft > 0) || !(rawRight > 0)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_corner_transition_runout_invalid',
                    `Balcony continuity link "${link.id || linkIndex + 1}" requires positive left and right corner runouts.`,
                    context
                ));
            }
            const rawMeeting = rawTransition.meeting === undefined
                ? link.cornerTransition.meeting
                : Number(rawTransition.meeting);
            if (!Number.isFinite(rawMeeting) || !(rawMeeting > 0) || !(rawMeeting < 1)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_corner_transition_meeting_invalid',
                    `Balcony continuity link "${link.id || linkIndex + 1}" requires a corner meeting position greater than 0 and less than 1.`,
                    context
                ));
            }
        }
    });

    // Identity conflicts invalidate every participant. Choosing the first
    // record would make link-array order semantic and would leave remap/editor
    // identity ambiguous.
    for (const [linkId, occurrences] of linkOccurrencesById) {
        if (occurrences.length < 2) continue;
        for (const occurrence of occurrences) {
            diagnostics.push(diagnostic(
                'balcony_continuity_link_id_duplicate',
                `Balcony continuity link id "${linkId}" is not unique; every duplicate record is disabled.`,
                occurrence
            ));
        }
    }

    // Only otherwise well-formed links may participate in endpoint ownership.
    // This prevents a malformed record from suppressing unrelated valid
    // geometry. As with duplicate ids, every competing owner is invalidated so
    // permutations of the authored link array resolve identically.
    const endpointOccurrences = new Map();
    config.links.forEach((link, linkIndex) => {
        if (linkHasStructuralError(diagnostics, linkIndex)) return;
        link.endpoints.forEach((endpoint, endpointIndex) => {
            const endpointKey = balconyContinuityEndpointKey(endpoint);
            if (!endpointKey) return;
            if (!endpointOccurrences.has(endpointKey)) endpointOccurrences.set(endpointKey, []);
            endpointOccurrences.get(endpointKey).push({
                endpoint,
                endpointIndex,
                linkId: link.id,
                linkIndex
            });
        });
    });
    for (const occurrences of endpointOccurrences.values()) {
        if (occurrences.length < 2) continue;
        const owners = occurrences.map((entry) => `"${entry.linkId || entry.linkIndex + 1}"`).join(', ');
        for (const occurrence of occurrences) {
            diagnostics.push(diagnostic(
                'balcony_continuity_endpoint_already_linked',
                `Endpoint ${occurrence.endpoint.faceId}:${occurrence.endpoint.bayId}:${occurrence.endpoint.edge} has competing owners ${owners}; every competing link is disabled.`,
                occurrence
            ));
        }
    }

    return { valid: diagnostics.length === 0, config, diagnostics };
}

/**
 * Resolves valid endpoint identities against physical solved strips. Matching
 * deliberately uses only `strip.faceId + strip.sourceBayId`; array positions,
 * display labels, and face-link masters are not endpoint identities.
 */
export function resolveBalconyContinuityLinks({ continuity, stripsByFaceId } = {}) {
    const structural = validateBalconyContinuityConfig(continuity);
    if (!structural.config) return { valid: structural.valid, links: [], diagnostics: structural.diagnostics };

    const diagnostics = [...structural.diagnostics];
    const strips = allSolvedStrips(stripsByFaceId);
    const links = [];

    structural.config.links.forEach((link, linkIndex) => {
        if (linkHasStructuralError(structural.diagnostics, linkIndex)) return;
        const resolvedEndpoints = [];
        let failed = false;

        link.endpoints.forEach((endpoint, endpointIndex) => {
            const matches = strips.filter((strip) => (
                strip.faceId === endpoint.faceId
                && strip.sourceBayId === endpoint.bayId
            ));
            if (!matches.length) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_endpoint_missing',
                    `Link "${link.id}" cannot find balcony bay ${endpoint.faceId}:${endpoint.bayId} in the solved physical facade.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
                failed = true;
                return;
            }
            if (matches.length > 1) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_endpoint_ambiguous',
                    `Link "${link.id}" matches ${matches.length} solved strips for ${endpoint.faceId}:${endpoint.bayId}; repeated or multi-span bay endpoints are unsupported.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
                failed = true;
                return;
            }
            const strip = matches[0];
            if (!normalizeBalconyConfig(strip.balcony)) {
                diagnostics.push(diagnostic(
                    'balcony_continuity_endpoint_has_no_balcony',
                    `Link "${link.id}" targets ${endpoint.faceId}:${endpoint.bayId}, but that solved bay has no enabled balcony.`,
                    { linkId: link.id, linkIndex, endpointIndex }
                ));
                failed = true;
                return;
            }
            resolvedEndpoints.push({ ...endpoint, strip });
        });

        if (!failed && resolvedEndpoints.length === 2) {
            links.push({
                id: link.id,
                endpoints: resolvedEndpoints,
                ...(link.cornerTransition ? { cornerTransition: link.cornerTransition } : {})
            });
        }
    });

    return { valid: diagnostics.length === 0, links, diagnostics };
}
