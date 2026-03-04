// src/graphics/gui/mesh_fabrication/file_loader/index.js

import { createMeshFetchTransport } from './meshFetchTransport.js';
import { createMeshPayloadParserValidator } from './meshPayloadParserValidator.js';
import { createMeshPollScheduler } from './meshPollScheduler.js';
import { createMeshSourceResolver } from './meshSourceResolver.js';
import { createMeshSyncStateStore } from './meshSyncStateStore.js';

export {
    createMeshFetchTransport,
    createMeshPayloadParserValidator,
    createMeshPollScheduler,
    createMeshSourceResolver,
    createMeshSyncStateStore
};

export function createLiveMeshFileLoader({
    endpoint,
    staticFileUrl,
    pollIntervalMs,
    updatePulseMs,
    parseDocument,
    onDocument,
    onStateChange,
    fetchImpl = null,
    timerApi = null
}) {
    if (typeof onDocument !== 'function') {
        throw new Error('[LiveMeshFileLoader] onDocument callback is required.');
    }

    const syncState = createMeshSyncStateStore();
    const transport = createMeshFetchTransport({ fetchImpl });
    const parser = createMeshPayloadParserValidator({ parseDocument });

    let currentEndpoint = String(endpoint ?? '').trim();
    let currentStaticFileUrl = String(staticFileUrl ?? '').trim();
    let abortController = null;

    const notifyState = () => {
        if (typeof onStateChange === 'function') {
            onStateChange(syncState.getSnapshot());
        }
    };

    const setState = (partial) => {
        syncState.set(partial);
        notifyState();
    };

    const clearInFlight = () => {
        setState({ inFlight: false, lastCheckMs: Date.now() });
        abortController = null;
    };

    const poll = async ({ force = false } = {}) => {
        const snapshot = syncState.getSnapshot();
        if (!snapshot.enabled || snapshot.inFlight) return;

        setState({ inFlight: true, lastCheckMs: Date.now() });

        const controller = new AbortController();
        abortController = controller;

        try {
            const response = await transport.requestJson({
                url: currentEndpoint,
                force,
                etag: snapshot.etag,
                lastModified: snapshot.lastModified,
                signal: controller.signal
            });

            if (response.kind === 'not_modified') {
                setState({ label: 'Not modified', hasError: false });
                return;
            }

            const parsed = parser.validateAndParse(response.payload);
            await onDocument(response.payload, parsed);
            setState({
                etag: response.etag,
                lastModified: response.lastModified,
                label: 'Updated',
                hasError: false,
                updatePulseUntilMs: Date.now() + Math.max(0, Number(updatePulseMs) || 0)
            });
        } catch (error) {
            if (abortController?.signal?.aborted) return;
            const message = typeof error?.message === 'string' ? error.message : String(error);
            setState({ label: `Error: ${message}`, hasError: true });
            throw error;
        } finally {
            clearInFlight();
        }
    };

    const loadBootstrap = async () => {
        const snapshot = syncState.getSnapshot();
        if (snapshot.bootstrapTried) return;
        setState({ bootstrapTried: true });

        const response = await transport.requestJson({
            url: currentStaticFileUrl,
            force: true,
            signal: null
        });
        if (response.kind !== 'updated') return;
        const parsed = parser.validateAndParse(response.payload);
        await onDocument(response.payload, parsed);
        setState({
            label: 'Loaded default mesh',
            hasError: false,
            updatePulseUntilMs: Date.now() + Math.max(0, Number(updatePulseMs) || 0)
        });
    };

    const scheduler = createMeshPollScheduler({
        intervalMs: pollIntervalMs,
        timerApi,
        onTick: async () => {
            try {
                await poll();
            } catch {}
        }
    });

    return Object.freeze({
        start() {
            setState({ enabled: true, label: 'Connecting', hasError: false });
            void loadBootstrap().catch(() => {});
            void poll({ force: true }).catch(() => {});
            scheduler.start();
        },
        stop() {
            scheduler.stop();
            abortController?.abort();
            abortController = null;
            setState({ inFlight: false });
        },
        toggleEnabled() {
            const snapshot = syncState.getSnapshot();
            if (snapshot.enabled) {
                setState({ enabled: false, label: 'Polling paused', hasError: false });
                scheduler.stop();
                abortController?.abort();
                abortController = null;
                setState({ inFlight: false });
                return false;
            }
            setState({ enabled: true, label: 'Connecting', hasError: false });
            void poll({ force: true }).catch(() => {});
            scheduler.start();
            return true;
        },
        async poll(options = null) {
            return poll(options ?? undefined);
        },
        async loadBootstrap() {
            return loadBootstrap();
        },
        setEndpoint(url) {
            currentEndpoint = String(url ?? '').trim();
        },
        setStaticFileUrl(url) {
            currentStaticFileUrl = String(url ?? '').trim();
        },
        getSnapshot() {
            return syncState.getSnapshot();
        }
    });
}

export function createResolvedLiveMeshFileLoader({
    locationLike = null,
    pollIntervalMs,
    updatePulseMs,
    parseDocument,
    onDocument,
    onStateChange,
    fetchImpl = null,
    timerApi = null
}) {
    const resolver = createMeshSourceResolver(locationLike);
    return createLiveMeshFileLoader({
        endpoint: resolver.resolveApiEndpoint(),
        staticFileUrl: resolver.resolveStaticFileUrl(),
        pollIntervalMs,
        updatePulseMs,
        parseDocument,
        onDocument,
        onStateChange,
        fetchImpl,
        timerApi
    });
}
