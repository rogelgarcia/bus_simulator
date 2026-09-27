// Compact grass catalog drawer and a transform switch beside the selected plant.
// @ts-check

/** @typedef {'move'|'rotate'|'size'} AuthoringTool */
/** @typedef {{id:string,catalogId:string,label:string,position:{x:number,z:number},rotationDegrees:number,inclinationDegrees:number,burialMeters:number,scale:number}} TuftRecord */
/** @typedef {{id:string,label:string,description:string,thumbnail:string}} CatalogEntry */

const TOOLS = Object.freeze([
    ['move', 'Move', 'Move: X/Z · Burial: Y'],
    ['rotate', 'Rotate', 'Turn: Y · Incline: local X'],
    ['size', 'Size', 'Uniform size']
]);

function element(tag, className, text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

/**
 * @param {{
 * catalog:CatalogEntry[],
 * onToggle:(open:boolean)=>void,
 * onTool:(tool:AuthoringTool)=>void,
 * onDelete:()=>void,
 * onExport:()=>void,
 * onCatalogSelect:(id:string)=>void
 * }} options
 */
export function createGrassDebugV2AuthoringPanel({ catalog, onToggle, onTool, onDelete, onExport, onCatalogSelect }) {
    const dock = document.getElementById('grass-authoring-dock');
    const tab = document.getElementById('grass-authoring-tab');
    const panel = document.getElementById('grass-authoring-panel');
    if (!dock || !(tab instanceof HTMLButtonElement) || !panel) throw new Error('Grass authoring panel markup is missing.');
    if (!Array.isArray(catalog) || !catalog.length || catalog.some(entry =>
        !entry.id || !entry.label || typeof entry.description !== 'string' || typeof entry.thumbnail !== 'string'
    )) throw new Error('Grass authoring catalog entries require id, label, description and thumbnail.');
    if ([onToggle, onTool, onDelete, onExport, onCatalogSelect].some(callback => typeof callback !== 'function'))
        throw new Error('Grass authoring panel callbacks are required.');

    const events = new AbortController();
    const listen = (node, type, callback) => node.addEventListener(type, callback, { signal: events.signal });
    let open = false;
    let selected = null;

    const catalogList = element('div', 'grass-authoring-catalog');
    catalogList.id = 'grass-authoring-catalog';
    catalogList.setAttribute('role', 'group');
    catalogList.setAttribute('aria-label', 'Plant catalog');
    for (const entry of catalog) {
        const button = element('button', 'grass-authoring-catalog-item');
        button.type = 'button';
        button.draggable = true;
        button.dataset.catalogId = entry.id;
        button.title = entry.description;
        const thumbnail = element('img', 'grass-authoring-thumbnail');
        thumbnail.src = entry.thumbnail;
        thumbnail.alt = '';
        thumbnail.draggable = false;
        button.append(thumbnail, element('span', '', entry.label));
        listen(button, 'dragstart', event => {
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('application/x-grass-tuft', entry.id);
            event.dataTransfer.setData('text/plain', entry.id);
        });
        listen(button, 'click', () => onCatalogSelect(entry.id));
        catalogList.append(button);
    }

    const actions = element('div', 'grass-authoring-actions');
    const exportButton = element('button', 'grass-authoring-export', 'Export');
    exportButton.type = 'button';
    exportButton.id = 'grass-authoring-export';
    exportButton.title = 'Copy the configuration to the clipboard';
    const status = element('output', 'grass-authoring-status');
    status.id = 'grass-authoring-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    actions.append(exportButton, status);
    panel.replaceChildren(catalogList, actions);
    panel.setAttribute('aria-label', 'Plant catalog and export');

    const toolbar = element('div', 'grass-authoring-tools');
    toolbar.id = 'grass-authoring-tools';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Plant transform');
    toolbar.hidden = true;
    const toolButtons = new Map();
    for (const [id, label, title] of TOOLS) {
        const button = element('button', '', label);
        button.type = 'button';
        button.dataset.authoringTool = id;
        button.title = title;
        listen(button, 'click', () => {
            setTool(/** @type {AuthoringTool} */ (id));
            onTool(/** @type {AuthoringTool} */ (id));
        });
        toolButtons.set(id, button);
        toolbar.append(button);
    }
    const deleteButton = element('button', 'grass-authoring-delete', 'Delete');
    deleteButton.id = 'grass-authoring-delete';
    deleteButton.type = 'button';
    deleteButton.title = 'Delete selection';
    toolbar.append(deleteButton);
    document.body.append(toolbar);

    dock.hidden = false;
    tab.disabled = false;
    listen(tab, 'click', () => setOpen(!open));
    listen(deleteButton, 'click', onDelete);
    listen(exportButton, 'click', onExport);

    function setOpen(value) {
        if (typeof value !== 'boolean') throw new Error('Authoring open state must be boolean.');
        if (value === open) return;
        open = value;
        if (!open && (panel.contains(document.activeElement) || toolbar.contains(document.activeElement))) tab.focus();
        document.body.classList.toggle('grass-authoring-open', open);
        dock.classList.toggle('is-open', open);
        panel.inert = !open;
        panel.setAttribute('aria-hidden', String(!open));
        tab.setAttribute('aria-expanded', String(open));
        if (!open) toolbar.hidden = true;
        onToggle(open);
    }

    /** @param {TuftRecord|null} record */
    function setSelection(record) {
        selected = record;
        deleteButton.disabled = !record;
        for (const button of toolButtons.values()) button.disabled = !record;
        if (!record) toolbar.hidden = true;
    }

    /** @param {AuthoringTool} tool */
    function setTool(tool) {
        if (!toolButtons.has(tool)) throw new Error('Unknown grass authoring tool: ' + tool);
        for (const [id, button] of toolButtons) button.setAttribute('aria-pressed', String(id === tool));
    }

    /** @param {{x:number,y:number,bounds:DOMRect}|null} anchor */
    function setAnchor(anchor) {
        toolbar.hidden = !open || !selected || !anchor;
        if (toolbar.hidden) return;
        const { bounds } = anchor, width = toolbar.offsetWidth, height = toolbar.offsetHeight, margin = 12;
        let x = Math.max(bounds.left + margin, Math.min(bounds.right - width - margin, anchor.x + 64));
        let y = Math.max(bounds.top + margin, Math.min(bounds.bottom - height - margin, anchor.y + 28));
        const study = document.querySelector('.plant-study-panel').getBoundingClientRect();
        if (x < study.right + margin && x + width > study.left - margin && y < study.bottom + margin && y + height > study.top - margin) {
            y = Math.min(bounds.bottom - height - margin, study.bottom + margin);
        }
        toolbar.style.left = x + 'px';
        toolbar.style.top = y + 'px';
    }

    setTool('move');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    return Object.freeze({
        setOpen, setSelection, setTool, setAnchor,
        setStatus(text) { status.textContent = text; },
        dispose() {
            events.abort();
            if (open) setOpen(false);
            dock.hidden = true;
            tab.disabled = true;
            panel.replaceChildren();
            toolbar.remove();
        }
    });
}
