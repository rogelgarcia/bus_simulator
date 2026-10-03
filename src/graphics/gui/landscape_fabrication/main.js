// Starts the standalone landscape tool and exposes deterministic verification hooks.
import { LandscapeView } from './LandscapeView.js';

const canvas = document.getElementById('game-canvas');
const source = new URL(location.href).searchParams.get('landscape');
const view = new LandscapeView(canvas, source ? { source } : {});
window.__landscapeTestHooks = Object.freeze({
    snapshot: () => view.snapshot(),
    setMode: mode => view.setMode(mode),
    setCamera: options => view.setCamera(options),
    setInspection: options => view.setInspection(options),
    setWater: visible => view.setWater(visible),
    setPlanning: options => view.setPlanning(options),
    focusReference: id => view.focusReference(id),
    saveBookmark: name => view.saveBookmark(name),
    focusBookmark: id => view.focusBookmark(id),
    removeBookmark: id => view.removeBookmark(id),
    reportSelection: () => view.reportSelection(),
    appearanceSample: (x, z) => view.appearance?.sample(x, z) ?? null,
    setBudgets: options => view.setBudgets(options),
    acquireConsumer: (ids, options) => view.acquireConsumer(ids, options),
    releaseConsumer: consumer => view.releaseConsumer(consumer),
    preset: name => view.preset(name),
    select: (x, z) => view.select(x, z),
    setSelectionRadius: radius => view.setSelectionRadius(radius),
    reload: () => view.load(),
    pause: () => view.pause(),
    resume: () => view.resume(),
    dispose: () => view.dispose()
});
window.addEventListener('pagehide', () => view.dispose(), { once: true });
await view.load();
