// Shared evidence gate for offline refinement and ordinary compiled-layout loading.
// @ts-check

/** Reject blank or clipped evidence before it can guide a rendered-layout search. */
export function validateGrassCanopyRenderedExposure(view) {
    const { sampleCount, clippedFraction, blackFraction, minimum, maximum, mean } = view;
    if (![sampleCount, clippedFraction, blackFraction, minimum, maximum, mean].every(Number.isFinite)
        || sampleCount < 1 || clippedFraction < 0 || clippedFraction >= .02 || blackFraction < 0 || blackFraction >= .02
        || !(mean > 2 && mean < 250) || maximum - minimum <= 1)
        throw new Error('Rendered canopy view is clipped or degenerate: ' + JSON.stringify({ distance: view.distance,
            elevation: view.elevation, azimuth: view.azimuth, sampleCount, clippedFraction, blackFraction, minimum, maximum, mean }));
}
