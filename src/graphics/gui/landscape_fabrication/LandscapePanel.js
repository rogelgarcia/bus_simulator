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
            <div class="landscape-streaming"><span data-field="streaming" role="status">Preparing bounded terrain streaming…</span><small data-field="streaming-detail">CPU buffers and estimated GPU residency</small><small data-field="appearance">Preparing independent soil masks and PBR pages…</small></div>
            <nav class="landscape-toolbar" aria-label="Terrain inspection">
                <div data-group="mode"></div><div data-group="camera"></div><div data-group="helpers"></div><div data-group="source"></div>
                <div class="landscape-projection"><label>Projection<select data-field="projection" aria-label="Camera projection"><option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label><label>FOV °<input data-field="fov" type="number" min="5" max="110" value="50" aria-label="Perspective field of view" /></label><label>Ortho span m<input data-field="span" type="number" min="20" max="20000" value="5000" aria-label="Orthographic view span" /></label><label>Zoom<input data-field="zoom" type="number" min="0.1" max="100" step="0.1" value="1" aria-label="Projection zoom" /></label></div>
            </nav>
            <details class="landscape-planning" data-field="planning-panel">
                <summary>Planning references &amp; views</summary>
                <div class="landscape-planning-body">
                    <small data-field="planning-status">Preparing retained planning references…</small>
                    <div class="landscape-planning-actions" data-group="planning"></div>
                    <label>Terrain diagnostic<select data-field="diagnostic" aria-label="Terrain diagnostic"><option value="none">Material surface</option><option value="elevation">Elevation + 5 m contours</option><option value="slope">Slope degrees</option><option value="water">Water depth</option></select></label>
                    <small data-field="diagnostic-legend">Diagnostics use displayed terrain LOD; native reports are separate.</small>
                    <label>Named source reference<select data-field="reference-list" aria-label="Named planning reference"><option value="">No references loaded</option></select></label>
                    <div class="landscape-planning-actions" data-group="reference"></div>
                    <small data-field="reference-info">Informational guides do not place city objects.</small>
                    <hr />
                    <label>Camera bookmark<input data-field="bookmark-name" maxlength="60" placeholder="Name this view" aria-label="Camera bookmark name" /></label>
                    <label>Saved views<select data-field="bookmark-list" aria-label="Saved camera bookmark"><option value="">No saved views</option></select></label>
                    <div class="landscape-planning-actions" data-group="bookmarks"></div>
                    <small data-field="bookmark-status">Saved locally for this source; independent of terrain revisions.</small>
                </div>
            </details>
            <aside class="landscape-selection">
                <span class="landscape-eyebrow">INSPECT LOCATION</span>
                <h2 data-field="selection-title">Point to the terrain</h2>
                <p data-field="selection">Click a surface to identify its world coordinates and cover type.</p>
                <small data-field="chunk">Select a point to inspect its rendered chunk and LOD.</small>
                <label class="landscape-radius">Selection radius (m)<input data-field="radius" type="number" value="25" min="0" max="1000" step="1" aria-label="Selection radius in meters" /><small>0 selects a point. Larger areas are checked against the native-data budget.</small></label>
                <div class="landscape-selection-actions" data-group="selection"></div>
                <small data-field="handoff">Selections are view-only. Terrain is unchanged.</small>
                <small class="landscape-report" data-field="report">Terrain report: select an area, then Inspect area.</small>
            </aside>
            <div class="landscape-legend" data-field="legend"></div>
            <footer class="landscape-footer"><span data-field="status" role="status">Preparing overview</span><span>Click: inspect · Right drag: orbit · Middle / Shift+right: pan · Wheel: zoom</span></footer>
            <output class="landscape-notice" data-field="notice" role="alert" hidden></output>`;
        const groups = {
            mode: [['mode:shaded', 'Shaded'], ['mode:wireframe', 'Wireframe'], ['mode:combined', 'Shaded + wire']],
            camera: [['camera:home', 'Overview'], ['camera:top', 'Top'], ['camera:ground', 'Beach approach']],
            helpers: [['grid', 'Grid'], ['axes', 'Axes'], ['lod', 'LOD colors'], ['boundaries', 'Chunk edges'], ['water', 'Water']],
            source: [['reload', 'Reload source']],
            planning: [['planning:districts', 'Districts'], ['planning:roads', 'Roads'], ['planning:shoreline', 'Shoreline'], ['planning:points', 'Points'], ['planning:corridors', 'View corridor']],
            reference: [['reference:focus', 'Focus reference']],
            bookmarks: [['bookmark:save', 'Save view'], ['bookmark:focus', 'Go'], ['bookmark:remove', 'Delete']],
            selection: [['focus-selection', 'Focus selection'], ['report-selection', 'Inspect area'], ['copy', 'Copy context'], ['download', 'Download JSON'], ['clear', 'Clear']]
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
        this.root.querySelector('[data-field="diagnostic"]').addEventListener('change', () => onAction('planning:diagnostic'), { signal: this.abort.signal });
        this.root.querySelector('[data-field="reference-list"]').addEventListener('change', () => onAction('reference:info'), { signal: this.abort.signal });
        this.root.querySelector('[data-field="planning-panel"]').addEventListener('toggle', event => this.root.classList.toggle('planning-open', event.target.open), { signal: this.abort.signal });
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

    references(features) {
        const select = this.root.querySelector('[data-field="reference-list"]'), previous = select.value;
        select.replaceChildren();
        for (const feature of features) {
            const option = document.createElement('option'); option.value = feature.id; option.textContent = `${feature.kind} · ${feature.name}`; select.append(option);
        }
        if (!features.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No retained planning references'; select.append(option); }
        if (features.some(feature => feature.id === previous)) select.value = previous;
    }

    bookmarks(records, selected) {
        const select = this.root.querySelector('[data-field="bookmark-list"]'), previous = selected ?? select.value;
        select.replaceChildren();
        for (const record of records) {
            const option = document.createElement('option'); option.value = record.id; option.textContent = record.name; select.append(option);
        }
        if (!records.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No saved views'; select.append(option); }
        if (records.some(record => record.id === previous)) select.value = previous;
    }

    dispose() { this.abort.abort(); this.root.remove(); }
}
