// Routes bounded landscape authoring requests to the shared persistent store.
// @ts-check
import { createLandscapeAuthoringStore } from '../landscape_authoring/LandscapeAuthoringStore.mjs';

/** @param {{directory:string,readJson:Function,reply:Function}} options */
export function createLandscapeAuthoringApi({ directory, readJson, reply }) {
    const store = createLandscapeAuthoringStore({ directory });
    const actions = Object.freeze({ query: value => store.query(value), apply: value => store.apply(value), revert: value => store.revert(value) });
    return async (request, response, pathname) => {
        const action = pathname.slice('/api/landscape/'.length);
        if (action !== 'state' && !Object.hasOwn(actions, action)) return false;
        if (action === 'state') {
            if (request.method !== 'GET') { reply(response, 405, { error: 'Use GET' }); return true; }
            reply(response, 200, await store.readState());
            return true;
        }
        if (request.method !== 'POST') { reply(response, 405, { error: 'Use POST' }); return true; }
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) { reply(response, 403, { error: 'Same-origin authoring required' }); return true; }
        if (!String(request.headers['content-type']).startsWith('application/json')) { reply(response, 415, { error: 'JSON required' }); return true; }
        const input = await readJson(request);
        if (action === 'query') {
            const controller = new AbortController();
            const abort = () => { if (!response.writableEnded) controller.abort(); };
            response.once('close', abort);
            try { reply(response, 200, await store.query({ ...input, signal: controller.signal })); }
            finally { response.off('close', abort); }
        } else reply(response, 200, await actions[action](input));
        return true;
    };
}
