// src/states/LaunchScreenParam.js
import { isLaunchableSceneId } from './SceneShortcutRegistry.js';

function getValidator(validate) {
    return typeof validate === 'function' ? validate : isLaunchableSceneId;
}

function getSearchFromLocation(locationLike) {
    if (!locationLike || typeof locationLike !== 'object') return '';
    if (typeof locationLike.search !== 'string') return '';
    return locationLike.search;
}

function getPathnameFromLocation(locationLike) {
    if (!locationLike || typeof locationLike !== 'object') return '';
    if (typeof locationLike.pathname !== 'string') return '';
    return locationLike.pathname;
}

function getHashFromLocation(locationLike) {
    if (!locationLike || typeof locationLike !== 'object') return '';
    if (typeof locationLike.hash !== 'string') return '';
    return locationLike.hash;
}

export function readLaunchScreenFromSearch(search, { isLaunchable = isLaunchableSceneId } = {}) {
    const validate = getValidator(isLaunchable);
    const rawSearch = typeof search === 'string' ? search : '';
    const params = new URLSearchParams(rawSearch);
    const raw = params.get('screen');
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || !validate(id)) return null;
    return id;
}

export function readLaunchScreenFromLocation(
    locationLike = (typeof window !== 'undefined' ? window.location : null),
    { isLaunchable = isLaunchableSceneId } = {}
) {
    return readLaunchScreenFromSearch(getSearchFromLocation(locationLike), { isLaunchable });
}

export function syncLaunchScreenParam(
    stateName,
    {
        locationLike = (typeof window !== 'undefined' ? window.location : null),
        historyLike = (typeof window !== 'undefined' ? window.history : null),
        isLaunchable = isLaunchableSceneId
    } = {}
) {
    if (!historyLike || typeof historyLike.replaceState !== 'function') return;
    if (!locationLike || typeof locationLike !== 'object') return;

    const validate = getValidator(isLaunchable);
    const params = new URLSearchParams(getSearchFromLocation(locationLike));
    const state = typeof stateName === 'string' ? stateName.trim() : '';
    if (state && validate(state)) params.set('screen', state);
    else params.delete('screen');

    const query = params.toString();
    const nextUrl = `${getPathnameFromLocation(locationLike)}${query ? `?${query}` : ''}${getHashFromLocation(locationLike)}`;
    historyLike.replaceState(historyLike.state, '', nextUrl);
}

export function prehideWelcomeForDirectLaunch(
    launchStateName,
    {
        doc = (typeof document !== 'undefined' ? document : null),
        welcomeElementId = 'ui-welcome'
    } = {}
) {
    const state = typeof launchStateName === 'string' ? launchStateName.trim() : '';
    if (!state || state === 'welcome') return;
    const root = doc && typeof doc === 'object' ? doc : null;
    if (!root || typeof root.getElementById !== 'function') return;
    const welcome = root.getElementById(welcomeElementId);
    welcome?.classList?.add?.('hidden');
}
