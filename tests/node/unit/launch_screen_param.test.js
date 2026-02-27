// Node unit tests: launch screen query parsing/sync and direct-launch UI prep.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    prehideWelcomeForDirectLaunch,
    readLaunchScreenFromLocation,
    readLaunchScreenFromSearch,
    syncLaunchScreenParam
} from '../../../src/states/LaunchScreenParam.js';

test('LaunchScreenParam: reads valid launch screen id from URL search', () => {
    const isLaunchable = (id) => id === 'building_fabrication2';
    assert.equal(
        readLaunchScreenFromSearch('?foo=1&screen=building_fabrication2', { isLaunchable }),
        'building_fabrication2'
    );
    assert.equal(
        readLaunchScreenFromSearch('?screen=  building_fabrication2  ', { isLaunchable }),
        'building_fabrication2'
    );
});

test('LaunchScreenParam: ignores missing and invalid launch screen id', () => {
    const isLaunchable = (id) => id === 'building_fabrication2';
    assert.equal(readLaunchScreenFromSearch('?foo=1', { isLaunchable }), null);
    assert.equal(readLaunchScreenFromSearch('?screen=invalid', { isLaunchable }), null);
    assert.equal(readLaunchScreenFromSearch('?screen=', { isLaunchable }), null);

    const locationLike = { search: '?screen=invalid' };
    assert.equal(readLaunchScreenFromLocation(locationLike, { isLaunchable }), null);
});

test('LaunchScreenParam: syncLaunchScreenParam sets screen query for launchable state', () => {
    const locationLike = {
        pathname: '/index.html',
        search: '?foo=1',
        hash: '#view'
    };
    let replacedUrl = null;
    let replacedState = null;
    const historyLike = {
        state: { key: 1 },
        replaceState: (state, unused, url) => {
            replacedState = state;
            replacedUrl = url;
            void unused;
        }
    };
    const isLaunchable = (id) => id === 'building_fabrication2';

    syncLaunchScreenParam('building_fabrication2', { locationLike, historyLike, isLaunchable });
    assert.deepEqual(replacedState, { key: 1 });
    assert.equal(replacedUrl, '/index.html?foo=1&screen=building_fabrication2#view');
});

test('LaunchScreenParam: syncLaunchScreenParam removes screen query for non-launchable states', () => {
    const locationLike = {
        pathname: '/index.html',
        search: '?foo=1&screen=building_fabrication2',
        hash: ''
    };
    let replacedUrl = null;
    const historyLike = {
        state: null,
        replaceState: (state, unused, url) => {
            replacedUrl = url;
            void state;
            void unused;
        }
    };
    const isLaunchable = (id) => id === 'building_fabrication2';

    syncLaunchScreenParam('welcome', { locationLike, historyLike, isLaunchable });
    assert.equal(replacedUrl, '/index.html?foo=1');
});

test('LaunchScreenParam: prehideWelcomeForDirectLaunch hides welcome only for non-welcome direct launch states', () => {
    let hiddenCount = 0;
    const welcome = {
        classList: {
            add: (name) => {
                if (name === 'hidden') hiddenCount += 1;
            }
        }
    };
    const doc = {
        getElementById: (id) => (id === 'ui-welcome' ? welcome : null)
    };

    prehideWelcomeForDirectLaunch('welcome', { doc });
    assert.equal(hiddenCount, 0);

    prehideWelcomeForDirectLaunch('building_fabrication2', { doc });
    assert.equal(hiddenCount, 1);
});
