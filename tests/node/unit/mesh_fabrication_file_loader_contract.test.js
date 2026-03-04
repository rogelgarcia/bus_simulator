// Node unit tests: mesh fabrication file-loader contracts (Section 19).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    createLiveMeshFileLoader,
    createMeshFetchTransport,
    createMeshPayloadParserValidator,
    createMeshPollScheduler,
    createMeshSourceResolver
} from '../../../src/graphics/gui/mesh_fabrication/file_loader/index.js';

const FIXTURE_PATH = new URL('../../fixtures/mesh_fabrication/box_authoring_fixture.handoff.v2.json', import.meta.url);
const FIXTURE_PAYLOAD = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

test('MeshFileLoader: source resolver resolves API and static URLs with override support', () => {
    const locationLike = {
        href: 'http://localhost:8001/screens/mesh_fabrication.html?meshEndpoint=http://example.test/api/custom'
    };
    const resolver = createMeshSourceResolver(locationLike);
    assert.equal(resolver.resolveApiEndpoint(), 'http://example.test/api/custom');
    assert.equal(resolver.resolveStaticFileUrl(), 'http://localhost:8001/assets/public/mesh_fabrication/handoff/mesh.live.v1.json');
});

test('MeshFileLoader: fetch transport returns not_modified and updated states deterministically', async () => {
    const responses = [
        {
            status: 304,
            ok: false,
            headers: new Headers(),
            json: async () => null
        },
        {
            status: 200,
            ok: true,
            headers: new Headers({ ETag: 'etag-2', 'Last-Modified': 'Wed, 04 Mar 2026 00:00:00 GMT' }),
            json: async () => FIXTURE_PAYLOAD
        }
    ];
    const transport = createMeshFetchTransport({
        fetchImpl: async () => responses.shift()
    });

    const first = await transport.requestJson({
        url: 'http://localhost:8001/api/mesh/current',
        etag: 'etag-1',
        lastModified: 'old'
    });
    assert.equal(first.kind, 'not_modified');
    assert.equal(first.etag, 'etag-1');

    const second = await transport.requestJson({
        url: 'http://localhost:8001/api/mesh/current'
    });
    assert.equal(second.kind, 'updated');
    assert.equal(second.etag, 'etag-2');
    assert.equal(second.lastModified, 'Wed, 04 Mar 2026 00:00:00 GMT');
    assert.equal(second.payload.meshId, FIXTURE_PAYLOAD.meshId);
});

test('MeshFileLoader: parser/validator runs headless without MeshFabricationView', () => {
    const parser = createMeshPayloadParserValidator({
        parseDocument: (payload) => Object.freeze({
            meshId: payload.meshId,
            objectCount: Array.isArray(payload?.authoring?.components) ? payload.authoring.components.length : 0
        })
    });
    const parsed = parser.validateAndParse(FIXTURE_PAYLOAD);
    assert.equal(parsed.meshId, 'fixture.mesh_fabrication.box');
    assert.equal(parsed.objectCount, 1);
});

test('MeshFileLoader: poll scheduler start/stop operates with injectable timer API', async () => {
    const calls = [];
    const timerApi = {
        setInterval(callback, intervalMs) {
            calls.push(intervalMs);
            callback();
            return 7;
        },
        clearInterval(id) {
            calls.push(id);
        }
    };

    let tickCount = 0;
    const scheduler = createMeshPollScheduler({
        intervalMs: 1000,
        timerApi,
        onTick: async () => {
            tickCount += 1;
        }
    });
    scheduler.start();
    scheduler.stop();

    assert.equal(tickCount, 1);
    assert.deepEqual(calls, [1000, 7]);
});

test('MeshFileLoader: facade propagates payload and state transitions', async () => {
    const states = [];
    const documents = [];

    const fetchImpl = async (url) => {
        if (String(url).includes('/static/mesh.json')) {
            return {
                status: 200,
                ok: true,
                headers: new Headers(),
                json: async () => FIXTURE_PAYLOAD
            };
        }
        return {
            status: 200,
            ok: true,
            headers: new Headers({ ETag: 'etag-live', 'Last-Modified': 'now' }),
            json: async () => FIXTURE_PAYLOAD
        };
    };

    const timerApi = {
        setInterval() {
            return 3;
        },
        clearInterval() {}
    };

    const loader = createLiveMeshFileLoader({
        endpoint: 'http://localhost:8001/api/mesh/current',
        staticFileUrl: 'http://localhost:8001/static/mesh.json',
        pollIntervalMs: 1000,
        updatePulseMs: 5000,
        fetchImpl,
        timerApi,
        parseDocument: (payload) => Object.freeze({
            meshId: payload.meshId,
            revision: payload.revision
        }),
        onDocument: async (payload, parsed) => {
            documents.push({ payload, parsed });
        },
        onStateChange: (state) => {
            states.push(state);
        }
    });

    loader.start();
    await loader.poll({ force: true });
    loader.stop();

    assert.ok(states.length >= 3);
    assert.ok(states.some((state) => state.label === 'Connecting'));
    assert.ok(states.some((state) => state.hasError === false));
    assert.ok(documents.length >= 1);
    assert.equal(documents[0].parsed.meshId, FIXTURE_PAYLOAD.meshId);
});
