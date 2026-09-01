// Enforces the exact non-City dynamic receiver ownership used by AI 531 production validation.
// @ts-check

export function requireProductionDynamicReceiverRootScope(roots, cityRoot, busRoot) {
    if (!(roots instanceof Set) || !cityRoot?.traverse || !busRoot?.traverse) {
        throw new TypeError('Production dynamic receiver scope requires roots, City, and bus Object3Ds');
    }
    const registered = [...roots];
    if (registered.length !== 1 || registered[0] !== busRoot) {
        throw new Error('Production dynamic receivers must contain exactly the bus anchor');
    }
    if (isObjectDescendantOf(busRoot, cityRoot) || isObjectDescendantOf(cityRoot, busRoot)) {
        throw new Error('Production dynamic receiver root must be disjoint from the static City');
    }
    return Object.freeze({registeredDynamicRootCount: registered.length});
}

export function requireNonCityDynamicReceiverTarget(object, cityRoot) {
    if (!object?.isMesh || !cityRoot?.traverse) {
        throw new TypeError('Production dynamic receiver target requires a mesh and City Object3D');
    }
    if (isObjectDescendantOf(object, cityRoot)) {
        throw new Error('Production dynamic receiver mask must not contain a static City mesh');
    }
    return object;
}

export function productionShadowLumaDarkeningByte(enabledPixels, disabledPixels, offset) {
    return (disabledPixels[offset] - enabledPixels[offset]) * 0.2126
        + (disabledPixels[offset + 1] - enabledPixels[offset + 1]) * 0.7152
        + (disabledPixels[offset + 2] - enabledPixels[offset + 2]) * 0.0722;
}

function isObjectDescendantOf(object, ancestor) {
    for (let cursor = object; cursor; cursor = cursor.parent) {
        if (cursor === ancestor) return true;
    }
    return false;
}
