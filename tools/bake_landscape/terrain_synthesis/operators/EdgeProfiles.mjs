// Evaluates the designed edge profiles (escarpment, embankment, retaining, ramp, feather) that carry a plateau target down to its surroundings.
// @ts-check
// A profile is a function of the distance d outward from the polygon boundary and the local target height T. Escarpment: a flat rim
// band, then a rock face at faceSlopeDegrees that drops faceDropMeters (or continues when the drop is 0), then a talus apron at
// talusSlopeDegrees; embankment and retaining are one engineered slope (retaining uses the steepest slope a heightfield holds); these
// three descend without a base and meet the ground at a toe the caller resolves (daylight march along the outward normal, the ground at
// a probe distance, the ground under the sample, or an explicit base). Ramp (linear over rampLengthMeters) and feather (the v2
// smoothstep over featherMeters) need the base level at the end of their run. Composition outside the boundary: max keeps the higher
// of ground and profile with a rounded toe (quadratic arc over +/- blendMeters along the profile, never wider than the final descending
// segment), replace imposes the profile through its run and then the caller's surface beyond the toe, blend mixes those two surfaces
// with a smoothstep across the toe. Inside the boundary the target replaces the surface.

const DEGREES = Math.PI / 180;
const smooth = t => { const s = Math.min(1, Math.max(0, t)); return s * s * (3 - 2 * s); };

/**
 * @param {{profile:string,rimWidthMeters:number,faceSlopeDegrees:number,faceDropMeters:number,talusSlopeDegrees:number,slopeDegrees:number,maxHeightfieldSlopeDegrees:number,
 *   rampLengthMeters:number,featherMeters:number,blendMeters:number,combine:string}} params
 */
export function createEdgeProfile(params) {
    const tanFace = Math.tan(params.faceSlopeDegrees * DEGREES), tanTalus = Math.tan(params.talusSlopeDegrees * DEGREES);
    const tanSlope = Math.tan((params.profile === 'retaining' ? params.maxHeightfieldSlopeDegrees : params.slopeDegrees) * DEGREES), rim = params.rimWidthMeters;
    const marching = params.profile === 'escarpment' || params.profile === 'embankment' || params.profile === 'retaining';
    const faceRun = params.faceDropMeters > 0 ? params.faceDropMeters / tanFace : Infinity;

    /** Unbounded descent of a marching profile at outward distance d from target T. @param {number} d @param {number} T */
    function descent(d, T) {
        if (params.profile !== 'escarpment') return T - d * tanSlope;
        if (d <= rim) return T;
        if (d <= rim + faceRun) return T - (d - rim) * tanFace;
        return T - params.faceDropMeters - (d - rim - faceRun) * tanTalus;
    }

    /** Toe distance and final descending segment [toe, tangent, run] of the profile from T down to base B. @param {number} T @param {number} B @param {Float64Array} out */
    function geometry(T, B, out) {
        const drop = Math.max(0, T - B);
        if (params.profile === 'escarpment') {
            const faceDrop = params.faceDropMeters > 0 ? Math.min(params.faceDropMeters, drop) : drop, run = faceDrop / tanFace, talusRun = (drop - faceDrop) / tanTalus;
            out[0] = rim + run + talusRun; out[1] = talusRun > 0 ? tanTalus : tanFace; out[2] = talusRun > 0 ? talusRun : run;
        } else if (marching) { out[0] = drop / tanSlope; out[1] = tanSlope; out[2] = out[0]; }
        else if (params.profile === 'ramp') { out[0] = params.rampLengthMeters; out[1] = drop / out[0]; out[2] = out[0]; }
        else { out[0] = params.featherMeters; out[1] = 0; out[2] = 0; }
        return out;
    }

    /** Profile height at d given the target, the base at the toe and the toe distance. @param {number} d @param {number} T @param {number} B @param {number} toe */
    function height(d, T, B, toe) {
        if (marching) return d <= toe ? descent(d, T) : B;
        if (params.profile === 'ramp') return d <= toe ? T - (T - B) * d / toe : B;
        return B + (T - B) * (1 - smooth(d / toe));
    }

    /**
     * Daylight march of a marching profile: the distance where the descent last dives below the ground within `reach` (interpolated
     * between steps), so the run cuts the ground above the profile and buries ground below it until the talus finally daylights.
     * Returns the rim width when the ground is above the descent everywhere past the rim, and Infinity when the descent is still at or
     * above the ground at `reach` (unresolved run).
     * @param {number} T @param {(s:number)=>number} groundAt ground height at outward distance s @param {number} reach @param {number} step
     */
    function daylight(T, groundAt, reach, step) {
        let aboveAt = NaN, aboveBy = 0, crossing = NaN;
        for (let s = rim + step; s <= reach; s += step) {
            const difference = descent(s, T) - groundAt(s);
            if (difference >= 0) { aboveAt = s; aboveBy = difference; crossing = NaN; }
            else if (!Number.isNaN(aboveAt) && Number.isNaN(crossing)) crossing = aboveAt + (s - aboveAt) * aboveBy / (aboveBy - difference);
        }
        if (Number.isNaN(aboveAt)) return rim;
        return Number.isNaN(crossing) ? Infinity : crossing;
    }

    /**
     * Composite height of a sample outside the boundary.
     * @param {number} d outward distance @param {number} T target @param {number} G ground @param {number} B base at the toe @param {number} toe toe distance (Infinity: the sample lies inside an unresolved run)
     * @param {number} beyond surface the profile hands over to past the toe @param {Float64Array} scratch length 3
     */
    function compose(d, T, G, B, toe, beyond, scratch) {
        const P = height(d, T, B, toe);
        if (params.combine === 'max') {
            if (!Number.isFinite(toe)) return Math.max(G, P);
            geometry(T, B, scratch);
            const k = Math.min(params.blendMeters, scratch[2]), u = toe - d;
            if (k <= 0 || u >= k || u <= -k) return d <= toe ? Math.max(G, P) : G;
            return Math.max(G, d <= toe ? P : G, B + scratch[1] * (u + k) * (u + k) / (4 * k));
        }
        if (params.combine === 'replace') return d <= toe ? P : beyond;
        const w = params.blendMeters > 0 ? 1 - smooth((d - toe + params.blendMeters) / (2 * params.blendMeters)) : d <= toe ? 1 : 0;
        return beyond + w * (P - beyond);
    }

    return Object.freeze({ marching, descent, geometry, height, daylight, compose });
}
