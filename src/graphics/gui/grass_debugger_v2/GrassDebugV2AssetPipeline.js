// Build and own the derived resources for one immutable grass asset configuration.
// @ts-check

/**
 * @typedef {{id:string, dependencies?:string[], parameters?:any,
 * generate:(dependencies:Record<string, any>) => any | Promise<any>,
 * dispose?:(resource:any) => void}} GrassAssetItem
 */

function copyParameters(value, path = 'parameters', ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || ancestors.has(value)) {
        throw new TypeError('Grass asset pipeline: ' + path + ' must contain finite, acyclic JSON data');
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Grass asset pipeline: ' + path + ' must contain plain JSON data');
    }
    ancestors.add(value);
    const result = Array.isArray(value)
        ? value.map((entry, index) => copyParameters(entry, path + '[' + index + ']', ancestors))
        : Object.fromEntries(Object.entries(value).map(([key, entry]) =>
            [key, copyParameters(entry, path + '.' + key, ancestors)]));
    ancestors.delete(value);
    return result;
}

/** @param {{items:GrassAssetItem[], sourceKey?:string}} options */
export function createGrassDebugV2AssetPipeline({ items, sourceKey = '' }) {
    if (!Array.isArray(items) || typeof sourceKey !== 'string') {
        throw new TypeError('Grass asset pipeline: items must be an array and sourceKey a string');
    }
    const records = new Map();
    for (const item of items) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() || records.has(item.id)) {
            throw new TypeError('Grass asset pipeline: every item needs a unique, nonempty id');
        }
        const dependencies = item.dependencies ?? [];
        if (!Array.isArray(dependencies) || dependencies.some(id => typeof id !== 'string' || !id.trim())
            || new Set(dependencies).size !== dependencies.length || typeof item.generate !== 'function'
            || (item.dispose !== undefined && typeof item.dispose !== 'function')) {
            throw new TypeError('Grass asset pipeline: invalid dependencies, generator or disposer for ' + item.id);
        }
        records.set(item.id, {
            id: item.id,
            dependencies: dependencies.slice(),
            parameters: copyParameters(item.parameters === undefined ? {} : item.parameters),
            generate: item.generate,
            dispose: item.dispose ?? (resource => resource?.dispose?.()),
            status: 'pending',
            resource: undefined
        });
    }
    const visited = new Set(), visiting = new Set();
    function visit(id, chain = []) {
        if (!records.has(id)) throw new Error('Grass asset pipeline: missing dependency ' + id);
        if (visiting.has(id)) throw new Error('Grass asset pipeline: dependency cycle ' + [...chain, id].join(' -> '));
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dependency of records.get(id).dependencies) visit(dependency, [...chain, id]);
        visiting.delete(id);
        visited.add(id);
    }
    for (const id of records.keys()) visit(id);

    let state = 'active', failure;
    let queue = Promise.resolve();
    const scheduled = new Map(), buildOrder = [];
    function assertActive() {
        if (state !== 'active') throw new Error('Grass asset pipeline is ' + state, { cause: failure });
    }
    function find(id) {
        if (!records.has(id)) throw new Error('Grass asset pipeline: unknown item ' + id);
        return records.get(id);
    }
    function cleanup() {
        const errors = [];
        while (buildOrder.length) {
            const record = buildOrder.pop();
            const resource = record.resource;
            record.resource = undefined;
            record.status = 'disposed';
            try { record.dispose(resource); } catch (error) { errors.push(error); }
        }
        return errors;
    }
    async function generate(record) {
        if (record.status === 'ready') return record.resource;
        assertActive();
        record.status = 'building';
        try {
            const dependencies = [];
            for (const id of record.dependencies) dependencies.push([id, await generate(find(id))]);
            assertActive();
            const resource = await record.generate(Object.freeze(Object.fromEntries(dependencies)));
            if (state !== 'active') {
                record.status = 'disposed';
                record.dispose(resource);
                assertActive();
            }
            record.resource = resource;
            record.status = 'ready';
            buildOrder.push(record);
            return resource;
        } catch (error) {
            if (record.status !== 'disposed') record.status = 'failed';
            throw error;
        }
    }
    function build(id) {
        let record;
        try { record = find(id); assertActive(); } catch (error) { return Promise.reject(error); }
        if (record.status === 'ready') return Promise.resolve(record.resource);
        if (scheduled.has(id)) return scheduled.get(id);
        const pending = queue.then(() => {
            assertActive();
            return generate(record);
        }).catch(error => {
            if (state === 'active') {
                state = 'failed';
                failure = error;
                const errors = cleanup();
                if (errors.length) throw new AggregateError([error, ...errors], 'Grass asset pipeline failed during generation and cleanup');
            }
            throw error;
        });
        scheduled.set(id, pending);
        queue = pending.then(() => undefined, () => undefined);
        return pending;
    }
    return Object.freeze({
        build,
        async buildAll(ids = [...records.keys()]) {
            if (!Array.isArray(ids)) throw new TypeError('Grass asset pipeline: buildAll ids must be an array');
            ids.forEach(find);
            assertActive();
            const resources = [];
            for (const id of ids) resources.push([id, await build(id)]);
            return Object.freeze(Object.fromEntries(resources));
        },
        get(id) {
            const record = find(id);
            assertActive();
            if (record.status !== 'ready') throw new Error('Grass asset pipeline: item ' + id + ' has not been built');
            return record.resource;
        },
        getSnapshot() {
            return {
                sourceKey,
                items: [...records.values()].map(record => ({
                    id: record.id,
                    dependencies: record.dependencies.slice(),
                    parameters: copyParameters(record.parameters),
                    status: record.status
                }))
            };
        },
        dispose() {
            if (state === 'disposed') return;
            state = 'disposed';
            const errors = cleanup();
            if (errors.length) throw new AggregateError(errors, 'Grass asset pipeline resource disposal failed');
        }
    });
}
