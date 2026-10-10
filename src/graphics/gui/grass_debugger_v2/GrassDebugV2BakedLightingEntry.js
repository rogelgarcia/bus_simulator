// Keep module loading and preparation failures visible in the isolated lab.
const loading = document.querySelector('#scene-loading');
const controls = [...document.querySelectorAll('#scene-panel input, #scene-panel select, #scene-panel button')];
controls.forEach(control => { control.disabled = true; });
window.__grassBakedReadiness = import('./GrassDebugV2BakedLightingScene.js').then(module => module.createGrassDebugV2BakedLightingScene())
    .then(viewer => { window.__grassBakedScene = viewer; controls.forEach(control => { control.disabled = false; }); return viewer.getSnapshot(); })
    .catch(error => { loading.hidden = false; loading.setAttribute('role', 'alert'); loading.textContent = 'Unable to load baked lighting lab. ' + error.message; console.error(error); throw error; });
void window.__grassBakedReadiness.catch(() => {});
