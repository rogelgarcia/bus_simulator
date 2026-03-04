// src/app/physics/rapier/RapierLoader.js
let rapierPromise = null;

export async function loadRapier() {
    if (!rapierPromise) {
        rapierPromise = import('@dimforge/rapier3d-compat').then(async (mod) => {
            const rapier = mod?.default ?? mod;
            if (rapier?.init) {
                await rapier.init();
            }
            return rapier;
        });
    }

    return rapierPromise;
}
