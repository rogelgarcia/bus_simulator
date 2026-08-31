// Owns staged resources and guarantees that every registered disposer runs at most once.
// @ts-check

/** @param {{diagnostics: Readonly<Record<string, any>>}} options */
export function createResourceDisposalRegistry({ diagnostics }) {
    const entries = [];
    const ids = new Set();
    let disposePromise = null;

    function register({ id, dispose, allocationToken = null }) {
        if (disposePromise) throw new Error('Cannot register a resource after disposal has started.');
        if (ids.has(id)) throw new Error(`Duplicate owned resource ID '${id}'.`);
        ids.add(id);
        const entry = {
            id,
            dispose,
            allocationToken,
            disposed: false,
            promise: null
        };
        entries.push(entry);
        return Object.freeze({
            id,
            dispose: (reason = 'released') => disposeEntry(entry, reason)
        });
    }

    async function disposeEntry(entry, reason) {
        if (entry.promise) return entry.promise;
        entry.disposed = true;
        entry.promise = Promise.resolve().then(async () => {
            let error = null;
            try {
                if (entry.dispose) await entry.dispose(reason);
            } catch (caught) {
                error = caught;
            } finally {
                if (entry.allocationToken !== null) diagnostics.release(entry.allocationToken);
            }
            return error;
        });
        return entry.promise;
    }

    function disposeAll(reason = 'disposed') {
        if (disposePromise) return disposePromise;
        disposePromise = Promise.resolve().then(async () => {
            const errors = [];
            for (let index = entries.length - 1; index >= 0; index -= 1) {
                const entry = entries[index];
                const error = await disposeEntry(entry, reason);
                if (error) errors.push(Object.freeze({ id: entry.id, error }));
            }
            diagnostics.recordDisposal(errors.length);
            return Object.freeze(errors);
        });
        return disposePromise;
    }

    return Object.freeze({
        disposeAll,
        register,
        get isDisposing() {
            return disposePromise !== null;
        }
    });
}
