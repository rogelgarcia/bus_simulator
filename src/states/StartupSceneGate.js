// Keeps the welcome screen responsive while deterministic scene assets load.
// @ts-check

/**
 * @param {{load: () => Promise<void>, go: (name: string, params: object) => void,
 * onStatus: (status: string, error?: Error) => void}} dependencies
 */
export function createStartupSceneGate({ load, go, onStatus }) {
    let status = 'idle';
    let requested = null;

    function preload() {
        if (status === 'loading' || status === 'ready') return;
        status = 'loading';
        onStatus(status);
        Promise.resolve().then(load).then(() => {
            status = 'ready';
            onStatus(status);
            const next = requested;
            requested = null;
            if (next) go(next.name, next.params);
        }, error => {
            status = 'error';
            onStatus(status, error);
        });
    }

    return Object.freeze({
        preload,
        go(name, params = {}) {
            if (name === 'welcome') {
                requested = null;
                go(name, params);
            } else if (status === 'ready') {
                go(name, params);
            } else {
                requested = { name, params };
                preload();
            }
        }
    });
}
