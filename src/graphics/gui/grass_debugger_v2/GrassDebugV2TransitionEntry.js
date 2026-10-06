// Keep module-link and shader-source failures inside the visible startup error boundary.
const loading = document.querySelector('#scene-loading');
document.querySelectorAll('#scene-panel input, #scene-panel select, #scene-panel button')
    .forEach(control => { control.disabled = true; });
loading.textContent = 'Loading transition modules…';

window.__grassTransitionReadiness = import('./GrassDebugV2TransitionScene.js?v=opaque-dissolve-1')
    .then(module => module.createGrassDebugV2TransitionScene())
    .then(viewer => {
        window.__grassTransitionScene = viewer;
        return viewer.getSnapshot();
    }).catch(error => {
        loading.hidden = false;
        loading.setAttribute('role', 'alert');
        loading.textContent = 'Unable to load transition lab. ' + error.message;
        console.error(error);
        throw error;
    });
// Retain a rejected readiness promise for callers without a second, unhandled error notification.
void window.__grassTransitionReadiness.catch(() => {});
