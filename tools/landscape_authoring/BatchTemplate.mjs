// Binds explicit edit templates to exact selection context or a saved revision identity.
// @ts-check

/** @param {any} template @param {any} context @param {{batchId:string}} options */
export function bindLandscapeBatchTemplate(template, context, { batchId }) {
    if (context?.format !== 'landscape-selection' || context.schemaVersion !== 1 || context.provisional !== false
        || context.editingReady !== true || !['circle', 'rectangle'].includes(context.region?.type)) throw new Error('[LandscapeAuthoring] Template binding needs an exact bounded-area selection context');
    if (typeof batchId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(batchId)) throw new Error('[LandscapeAuthoring] Supply a fresh stable batch ID of at most 100 characters');
    if (template?.format !== 'landscape-edit-batch' || template.schemaVersion !== 1 || template.id !== '$batchId'
        || template.landscapeId !== '$selection.landscapeId' || template.expectedRevision !== '$selection.sourceRevision'
        || !Array.isArray(template.operations) || !template.operations.length) throw new Error('[LandscapeAuthoring] Unsupported batch template structure');
    const batch = structuredClone(template);
    batch.id = batchId; batch.landscapeId = context.landscapeId; batch.expectedRevision = context.sourceRevision;
    for (const operation of batch.operations) {
        if (operation.region !== '$selection.region' || typeof operation.id !== 'string') throw new Error('[LandscapeAuthoring] Template operations must use the selected region');
        operation.id = `${batchId}/${operation.id}`;
        operation.region = structuredClone(context.region);
    }
    return batch;
}

/** State binding carries revision identity; it never claims that a large region was acquired as a selection.
 * @param {any} template @param {any} state @param {{batchId:string}} options */
export function bindLandscapeStateBatchTemplate(template, state, { batchId }) {
    const stableId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,159}$/.test(value);
    if (!stableId(state?.landscapeId) || !stableId(state?.revision)) throw new Error('[LandscapeAuthoring] State binding requires a saved landscapeId and revision');
    if (typeof batchId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(batchId)) throw new Error('[LandscapeAuthoring] Supply a fresh stable batch ID of at most 100 characters');
    if (template?.format !== 'landscape-edit-batch' || template.schemaVersion !== 1 || template.id !== '$batchId'
        || template.landscapeId !== '$state.landscapeId' || template.expectedRevision !== '$state.revision'
        || !Array.isArray(template.operations) || !template.operations.length) throw new Error('[LandscapeAuthoring] Unsupported state batch template structure');
    const batch = structuredClone(template);
    batch.id = batchId; batch.landscapeId = state.landscapeId; batch.expectedRevision = state.revision;
    for (const operation of batch.operations) {
        if (!stableId(operation.id) || !stableId(`${batchId}/${operation.id}`)
            || (!operation.regionId && (!operation.region || typeof operation.region !== 'object'))) throw new Error('[LandscapeAuthoring] State template operations need stable IDs and explicit regions or named region IDs');
        operation.id = `${batchId}/${operation.id}`;
    }
    return batch;
}
