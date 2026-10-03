// Compact landscape navigation, inspection, and selection context.
// @ts-check
export class LandscapePanel {
    /** @param {(action: string) => unknown} onAction */
    constructor(onAction) {
        this.abort = new AbortController();
        this.root = document.createElement('section');
        this.root.className = 'landscape-ui';
        this.root.innerHTML = `
            <header class="landscape-header">
                <div><span class="landscape-eyebrow">FABRICATION / LANDSCAPE</span><h1>Coastal city <span>Terrain workspace</span></h1></div>
                <div class="landscape-source"><span data-field="source">Loading landscape…</span><small data-field="revision">Validating prepared source</small></div>
            </header>
            <div class="landscape-streaming"><span data-field="streaming" role="status">Preparing bounded terrain streaming…</span><small data-field="streaming-detail">CPU buffers and estimated GPU residency</small></div>
            <nav class="landscape-toolbar" aria-label="Terrain inspection">
                <div data-group="mode"></div><div data-group="camera"></div><div data-group="helpers"></div><div data-group="source"></div>
                <div class="landscape-projection"><label>Projection<select data-field="projection" aria-label="Camera projection"><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label><label>FOV °<input data-field="fov" type="number" min="5" max="110" value="50" aria-label="Perspective field of view" /></label><label>Ortho span m<input data-field="span" type="number" min="20" max="20000" value="5000" aria-label="Orthographic view span" /></label><label>Zoom<input data-field="zoom" type="number" min="0.1" max="100" step="0.1" value="1" aria-label="Projection zoom" /></label></div>
            </nav>
            <aside class="landscape-selection">
                <span class="landscape-eyebrow">INSPECT LOCATION</span>
                <h2 data-field="selection-title">Point to the terrain</h2>
                <p data-field="selection">Click a surface to identify its world coordinates and cover type.</p>
                <small data-field="chunk">Select a point to inspect its rendered chunk and LOD.</small>
                <label class="landscape-radius">Selection radius (m)<input data-field="radius" type="number" value="25" min="0" max="1000" step="1" aria-label="Selection radius in meters" /><small>0 selects a point. Larger areas are checked against the native-data budget.</small></label>
                <div class="landscape-selection-actions" data-group="selection"></div>
                <small data-field="handoff">Selections are view-only. Terrain is unchanged.</small>
            </aside>
            <div class="landscape-legend" data-field="legend"></div>
            <footer class="landscape-footer"><span data-field="status" role="status">Preparing overview</span><span>Click: inspect · Right drag: orbit · Middle / Shift+right: pan · Wheel: zoom</span></footer>
            <output class="landscape-notice" data-field="notice" role="alert" hidden></output>`;
        const groups = {
            mode: [['mode:shaded', 'Shaded'], ['mode:wireframe', 'Wireframe'], ['mode:combined', 'Shaded + wire']],
            camera: [['camera:home', 'Overview'], ['camera:top', 'Top'], ['camera:ground', 'Beach approach']],
            helpers: [['grid', 'Grid'], ['axes', 'Axes'], ['lod', 'LOD colors'], ['boundaries', 'Chunk edges']],
            source: [['reload', 'Reload source']],
            selection: [['focus-selection', 'Focus selection'], ['copy', 'Copy context'], ['download', 'Download JSON'], ['clear', 'Clear']]
        };
        for (const [group, actions] of Object.entries(groups)) {
            const host = this.root.querySelector(`[data-group="${group}"]`);
            for (const [action, label] of actions) {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.action = action;
                button.textContent = label;
                button.addEventListener('click', () => onAction(action), { signal: this.abort.signal });
                host.append(button);
            }
        }
        document.body.append(this.root);
        this.root.querySelector('[data-field="radius"]').addEventListener('change', () => onAction('selection:radius'), { signal: this.abort.signal });
        for (const field of ['projection', 'fov', 'span', 'zoom']) this.root.querySelector(`[data-field="${field}"]`).addEventListener('change', () => onAction(field), { signal: this.abort.signal });
        this.active('mode:shaded', true);
        this.active('camera:home', true);
    }

    /** @param {string} field @param {string} value */
    text(field, value) { this.root.querySelector(`[data-field="${field}"]`).textContent = value; }

    active(action, enabled) {
        const button = this.root.querySelector(`[data-action="${action}"]`);
        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
    }

    mode(value) {
        for (const mode of ['shaded', 'wireframe', 'combined']) this.active(`mode:${mode}`, value === mode);
    }

    notice(message = '') {
        const notice = this.root.querySelector('[data-field="notice"]');
        notice.hidden = !message;
        notice.textContent = message;
    }

    dispose() { this.abort.abort(); this.root.remove(); }
}
