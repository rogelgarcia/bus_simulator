// Displays compact bake lifecycle states without changing their runtime owners.
// @ts-check

const ITEMS = Object.freeze([
    { id: 'shadows', label: 'Shadows' },
    { id: 'indirect', label: 'Indirect' },
    { id: 'busIndirect', label: 'Bus indirect' },
    { id: 'visibility', label: 'Visibility' }
]);
const PHASES = Object.freeze({
    locating: 'loading', fetching: 'loading', loading: 'loading',
    loading_indirect_maps: 'loading', validating: 'validating', source_validation: 'validating',
    extracting_scene: 'validating', checking_textures: 'validating', mapping_receivers: 'validating',
    hashing_source: 'validating', hashing_channels: 'validating', source_ready: 'validating',
    packaging_source: 'validating', validating_package: 'validating',
    decoding: 'preparing', uploading: 'preparing', prewarming: 'preparing',
    preparing_shaders: 'preparing', ready_to_commit: 'ready'
});
const LABELS = Object.freeze({
    off: 'Off', waiting: 'Waiting', loading: 'Loading', validating: 'Validating',
    preparing: 'Preparing', ready: 'Ready', disabled: 'Disabled', applied: 'Applied'
});
const APPLIED_DURATION_MS = 4000;

/** @param {{state?: string, phase?: string, reason?: string, causeState?: string}} [status] */
export function describeBakedStatus(status = {}) {
    const phase = status.phase ?? status.reason;
    let state;
    if (!status.state || ['off', 'current', 'disabled', 'disposed'].includes(status.state)) state = 'off';
    else if (status.state === 'active') state = 'applied';
    else if (status.state === 'waiting') state = 'waiting';
    else if (status.state === 'loading') state = PHASES[phase] ?? 'loading';
    else state = 'disabled';
    const detail = [status.causeState, status.reason ?? status.phase].filter(Boolean)
        .join(' · ').replaceAll('_', ' ');
    return { state, text: LABELS[state], detail };
}

function element(tag, className, text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

export class BakedStatusStrip {
    constructor() {
        this.root = element('div', 'ui-perf-bakes');
        this.root.setAttribute('aria-label', 'Baked items');
        this.items = ITEMS.map(({ id, label }) => {
            const root = element('span', 'ui-perf-bake');
            root.dataset.bake = id;
            root.tabIndex = 0;
            const name = element('span', 'ui-perf-bake-label', `${label}:`);
            const value = element('span', 'ui-perf-bake-value');
            root.append(name, value);
            this.root.appendChild(root);
            return { id, label, root, value, state: null, revision: null, appliedAt: 0 };
        });
        this.scope = null;
    }

    /** @param {any} snapshot @param {number} nowMs */
    update(snapshot, nowMs) {
        const scopeChanged = this.scope !== snapshot?.scope;
        this.scope = snapshot?.scope;
        for (const item of this.items) {
            const status = snapshot?.[item.id] ?? {};
            const { state, text, detail } = describeBakedStatus(status);
            const changed = scopeChanged || item.state !== state || item.revision !== status.revision;
            if (changed) {
                item.appliedAt = nowMs;
                item.state = state;
                item.revision = status.revision;
                item.root.dataset.state = state;
                item.value.textContent = text;
            }
            const title = `${item.label}: ${text}${detail ? ` — ${detail}` : ''}`;
            if (item.root.title !== title) {
                item.root.title = title;
                item.root.setAttribute('aria-label', title);
            }
            item.root.classList.toggle('is-settled', state === 'applied' && nowMs - item.appliedAt >= APPLIED_DURATION_MS);
        }
    }

    destroy() { this.root.remove(); }
}
