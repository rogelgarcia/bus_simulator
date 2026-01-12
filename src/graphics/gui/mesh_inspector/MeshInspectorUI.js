// src/graphics/gui/mesh_inspector/MeshInspectorUI.js
// HUD UI for browsing procedural meshes and copying region selection info.

export class MeshInspectorUI {
    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'ui-hud-root mesh-inspector-hud';
        this.root.id = 'mesh-inspector-hud';

        this.panel = document.createElement('div');
        this.panel.className = 'ui-panel is-interactive mesh-inspector-panel';

        this.axisLegend = document.createElement('div');
        this.axisLegend.className = 'mesh-inspector-axis-legend';
        this.axisLegend.innerHTML = `
            <span class="mesh-inspector-axis mesh-inspector-axis-x">X</span>
            <span class="mesh-inspector-axis mesh-inspector-axis-y">Y</span>
            <span class="mesh-inspector-axis mesh-inspector-axis-z">Z</span>
        `;

        this.title = document.createElement('div');
        this.title.className = 'ui-title';
        this.title.textContent = 'Mesh Inspector';

        this.meshIdRow = document.createElement('div');
        this.meshIdRow.className = 'mesh-inspector-row';
        this.meshIdLabel = document.createElement('div');
        this.meshIdLabel.className = 'mesh-inspector-row-label';
        this.meshIdLabel.textContent = 'Id';
        this.meshIdValue = document.createElement('div');
        this.meshIdValue.className = 'mesh-inspector-row-value';
        this.meshIdValue.textContent = '-';
        this.meshIdRow.appendChild(this.meshIdLabel);
        this.meshIdRow.appendChild(this.meshIdValue);

        this.meshNameRow = document.createElement('div');
        this.meshNameRow.className = 'mesh-inspector-row';
        this.meshNameLabel = document.createElement('div');
        this.meshNameLabel.className = 'mesh-inspector-row-label';
        this.meshNameLabel.textContent = 'Name';
        this.meshNameValue = document.createElement('div');
        this.meshNameValue.className = 'mesh-inspector-row-value';
        this.meshNameValue.textContent = '-';
        this.meshNameRow.appendChild(this.meshNameLabel);
        this.meshNameRow.appendChild(this.meshNameValue);

        this.catalogLabel = document.createElement('div');
        this.catalogLabel.className = 'ui-section-label';
        this.catalogLabel.textContent = 'Catalog';

        this.catalogRow = document.createElement('div');
        this.catalogRow.className = 'mesh-inspector-catalog';

        this.prevBtn = document.createElement('button');
        this.prevBtn.type = 'button';
        this.prevBtn.className = 'mesh-inspector-btn';
        this.prevBtn.textContent = 'Prev';

        this.nextBtn = document.createElement('button');
        this.nextBtn.type = 'button';
        this.nextBtn.className = 'mesh-inspector-btn';
        this.nextBtn.textContent = 'Next';

        this.meshSelect = document.createElement('select');
        this.meshSelect.className = 'mesh-inspector-select';

        this.catalogRow.appendChild(this.prevBtn);
        this.catalogRow.appendChild(this.meshSelect);
        this.catalogRow.appendChild(this.nextBtn);

        this.viewLabel = document.createElement('div');
        this.viewLabel.className = 'ui-section-label';
        this.viewLabel.textContent = 'View';

        const makeToggle = (label) => {
            const row = document.createElement('label');
            row.className = 'mesh-inspector-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            const text = document.createElement('span');
            text.textContent = label;
            row.appendChild(input);
            row.appendChild(text);
            return { row, input };
        };

        const wire = makeToggle('Wireframe');
        this.wireframeToggle = wire.row;
        this.wireframeInput = wire.input;

        const edges = makeToggle('Edges');
        this.edgesToggle = edges.row;
        this.edgesInput = edges.input;

        this.colorModeRow = document.createElement('div');
        this.colorModeRow.className = 'mesh-inspector-row';
        this.colorModeLabel = document.createElement('div');
        this.colorModeLabel.className = 'mesh-inspector-row-label';
        this.colorModeLabel.textContent = 'Colors';
        this.colorModeSelect = document.createElement('select');
        this.colorModeSelect.className = 'mesh-inspector-select';
        this.colorModeSelect.innerHTML = `
            <option value="semantic">Semantic</option>
            <option value="solid">Solid</option>
        `;
        this.colorModeRow.appendChild(this.colorModeLabel);
        this.colorModeRow.appendChild(this.colorModeSelect);

        this.skeletonLabel = document.createElement('div');
        this.skeletonLabel.className = 'ui-section-label';
        this.skeletonLabel.textContent = 'Skeleton';

        this.skeletonPanel = document.createElement('div');
        this.skeletonPanel.className = 'mesh-inspector-skeleton';

        this.selectionLabel = document.createElement('div');
        this.selectionLabel.className = 'ui-section-label';
        this.selectionLabel.textContent = 'Selection';

        this.hoverRow = document.createElement('div');
        this.hoverRow.className = 'mesh-inspector-row mesh-inspector-row-wide';
        this.hoverLabel = document.createElement('div');
        this.hoverLabel.className = 'mesh-inspector-row-label';
        this.hoverLabel.textContent = 'Hover';
        this.hoverValue = document.createElement('div');
        this.hoverValue.className = 'mesh-inspector-row-value';
        this.hoverValue.textContent = '-';
        this.hoverRow.appendChild(this.hoverLabel);
        this.hoverRow.appendChild(this.hoverValue);

        this.selectedRow = document.createElement('div');
        this.selectedRow.className = 'mesh-inspector-row mesh-inspector-row-wide';
        this.selectedLabel = document.createElement('div');
        this.selectedLabel.className = 'mesh-inspector-row-label';
        this.selectedLabel.textContent = 'Selected';
        this.selectedValue = document.createElement('div');
        this.selectedValue.className = 'mesh-inspector-row-value';
        this.selectedValue.textContent = '-';
        this.selectedRow.appendChild(this.selectedLabel);
        this.selectedRow.appendChild(this.selectedValue);

        this.summary = document.createElement('textarea');
        this.summary.className = 'mesh-inspector-summary';
        this.summary.rows = 3;
        this.summary.readOnly = true;
        this.summary.value = '';

        this.copyBtn = document.createElement('button');
        this.copyBtn.type = 'button';
        this.copyBtn.className = 'mesh-inspector-btn mesh-inspector-btn-primary';
        this.copyBtn.textContent = 'Copy selection';

        this.panel.appendChild(this.title);
        this.panel.appendChild(this.meshIdRow);
        this.panel.appendChild(this.meshNameRow);
        this.panel.appendChild(this.catalogLabel);
        this.panel.appendChild(this.catalogRow);
        this.panel.appendChild(this.viewLabel);
        this.panel.appendChild(this.wireframeToggle);
        this.panel.appendChild(this.edgesToggle);
        this.panel.appendChild(this.colorModeRow);
        this.panel.appendChild(this.skeletonLabel);
        this.panel.appendChild(this.skeletonPanel);
        this.panel.appendChild(this.selectionLabel);
        this.panel.appendChild(this.hoverRow);
        this.panel.appendChild(this.selectedRow);
        this.panel.appendChild(this.summary);
        this.panel.appendChild(this.copyBtn);

        this.root.appendChild(this.panel);
        this.root.appendChild(this.axisLegend);

        this.onMeshIdChange = null;
        this.onMeshPrev = null;
        this.onMeshNext = null;
        this.onWireframeChange = null;
        this.onEdgesChange = null;
        this.onColorModeChange = null;

        this._onSelectChange = () => this.onMeshIdChange?.(this.meshSelect.value);
        this._onPrev = () => this.onMeshPrev?.();
        this._onNext = () => this.onMeshNext?.();
        this._onWireframe = () => this.onWireframeChange?.(this.wireframeInput.checked);
        this._onEdges = () => this.onEdgesChange?.(this.edgesInput.checked);
        this._onColorMode = () => this.onColorModeChange?.(this.colorModeSelect.value);
        this._onCopy = () => this._copySummary();

        this._bound = false;
        this._skeletonApi = null;
    }

    mount() {
        if (!this.root.isConnected) document.body.appendChild(this.root);
        this._bind();
    }

    unmount() {
        this._unbind();
        this.root.remove();
    }

    setMeshOptions(options) {
        const list = Array.isArray(options) ? options : [];
        const current = this.meshSelect.value;
        this.meshSelect.textContent = '';
        for (const opt of list) {
            const id = typeof opt?.id === 'string' ? opt.id : '';
            if (!id) continue;
            const label = typeof opt?.label === 'string' ? opt.label : id;
            const el = document.createElement('option');
            el.value = id;
            el.textContent = `${label} (${id})`;
            this.meshSelect.appendChild(el);
        }
        if (current) this.meshSelect.value = current;
    }

    setSelectedMesh({ id = '-', name = '-' } = {}) {
        this.meshIdValue.textContent = id || '-';
        this.meshNameValue.textContent = name || '-';
        if (id) this.meshSelect.value = id;
    }

    setWireframeEnabled(enabled) {
        this.wireframeInput.checked = !!enabled;
    }

    setEdgesEnabled(enabled) {
        this.edgesInput.checked = !!enabled;
    }

    setColorMode(mode) {
        this.colorModeSelect.value = mode === 'solid' ? 'solid' : 'semantic';
    }

    setSkeleton(api) {
        const valid = !!api && typeof api === 'object'
            && !!api.schema && typeof api.getValue === 'function' && typeof api.setValue === 'function';
        this._skeletonApi = valid ? api : null;
        this.skeletonPanel.textContent = '';

        if (!this._skeletonApi) {
            this.skeletonLabel.style.display = 'none';
            this.skeletonPanel.style.display = 'none';
            return;
        }

        this.skeletonLabel.style.display = '';
        this.skeletonPanel.style.display = '';

        const renderGroup = (groupApi, { title = null, isChild = false } = {}) => {
            const schema = groupApi?.schema ?? null;
            if (!schema) return;

            const container = document.createElement('div');
            container.className = isChild ? 'mesh-inspector-skeleton-group' : 'mesh-inspector-skeleton-root';

            if (title) {
                const heading = document.createElement('div');
                heading.className = 'mesh-inspector-skeleton-group-title';
                heading.textContent = title;
                container.appendChild(heading);
            }

            const props = Array.isArray(schema.properties) ? schema.properties : [];
            for (const prop of props) {
                const propId = typeof prop?.id === 'string' ? prop.id : '';
                if (!propId) continue;

                const row = document.createElement('div');
                row.className = 'mesh-inspector-skeleton-row';

                const label = document.createElement('div');
                label.className = 'mesh-inspector-skeleton-row-label';
                label.textContent = prop?.label ?? propId;

                const control = document.createElement('div');
                control.className = 'mesh-inspector-skeleton-row-control';

                if (prop?.type === 'enum') {
                    const select = document.createElement('select');
                    select.className = 'mesh-inspector-select';
                    const options = Array.isArray(prop?.options) ? prop.options : [];
                    for (const opt of options) {
                        const optId = typeof opt?.id === 'string' ? opt.id : '';
                        if (!optId) continue;
                        const el = document.createElement('option');
                        el.value = optId;
                        el.textContent = opt?.label ?? optId;
                        select.appendChild(el);
                    }
                    select.value = groupApi.getValue(propId) ?? prop.defaultValue ?? '';
                    select.addEventListener('change', () => {
                        groupApi.setValue(propId, select.value);
                        select.value = groupApi.getValue(propId) ?? select.value;
                    });
                    control.appendChild(select);
                } else if (prop?.type === 'number') {
                    const wrap = document.createElement('div');
                    wrap.className = 'mesh-inspector-skeleton-number';

                    const slider = document.createElement('input');
                    slider.type = 'range';
                    slider.min = String(Number(prop?.min ?? 0));
                    slider.max = String(Number(prop?.max ?? 1));
                    slider.step = String(Number(prop?.step ?? 0.01));
                    slider.value = String(groupApi.getValue(propId) ?? prop.defaultValue ?? 0);
                    slider.className = 'mesh-inspector-skeleton-number-slider';

                    const value = document.createElement('div');
                    value.className = 'mesh-inspector-skeleton-number-value';
                    value.textContent = slider.value;

                    const sync = () => {
                        groupApi.setValue(propId, slider.value);
                        const next = groupApi.getValue(propId) ?? slider.value;
                        slider.value = String(next);
                        value.textContent = String(next);
                    };

                    slider.addEventListener('input', sync);
                    slider.addEventListener('change', sync);

                    wrap.appendChild(slider);
                    wrap.appendChild(value);
                    control.appendChild(wrap);
                }

                row.appendChild(label);
                row.appendChild(control);
                container.appendChild(row);
            }

            this.skeletonPanel.appendChild(container);

            const children = Array.isArray(groupApi.children) ? groupApi.children : [];
            for (const child of children) {
                const childLabel = child?.schema?.label ?? child?.schema?.id ?? 'Child';
                renderGroup(child, { title: childLabel, isChild: true });
            }
        };

        renderGroup(this._skeletonApi);
    }

    setHoverInfo(info) {
        this.hoverValue.textContent = info ? this._formatInfo(info) : '-';
    }

    setSelectedInfo(info) {
        this.selectedValue.textContent = info ? this._formatInfo(info) : '-';
        this._syncSummary(info);
    }

    _formatInfo(info) {
        const regionId = info?.regionId ?? '-';
        const tag = info?.tag ? ` • ${info.tag}` : '';
        return `${regionId}${tag}`;
    }

    _syncSummary(info) {
        if (!info) {
            this.summary.value = '';
            return;
        }
        const src = info?.sourceType
            ? ` src:${info.sourceType}${Number.isFinite(info?.sourceVersion) ? `@${info.sourceVersion}` : ''}`
            : '';
        const triangle = Number.isFinite(info.triangle) ? ` tri:${info.triangle}` : '';
        this.summary.value = `mesh:${info.meshId}${src} region:${info.regionId} tag:${info.tag}${triangle}`;
    }

    _copySummary() {
        const text = this.summary.value || '';
        if (!text) return;
        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(text));
            return;
        }
        this._fallbackCopy(text);
    }

    _fallbackCopy(text) {
        this.summary.focus();
        this.summary.select();
        try {
            document.execCommand('copy');
        } catch {
            // ignore
        }
        this.summary.setSelectionRange(text.length, text.length);
    }

    _bind() {
        if (this._bound) return;
        this._bound = true;
        this.meshSelect.addEventListener('change', this._onSelectChange);
        this.prevBtn.addEventListener('click', this._onPrev);
        this.nextBtn.addEventListener('click', this._onNext);
        this.wireframeInput.addEventListener('change', this._onWireframe);
        this.edgesInput.addEventListener('change', this._onEdges);
        this.colorModeSelect.addEventListener('change', this._onColorMode);
        this.copyBtn.addEventListener('click', this._onCopy);
    }

    _unbind() {
        if (!this._bound) return;
        this._bound = false;
        this.meshSelect.removeEventListener('change', this._onSelectChange);
        this.prevBtn.removeEventListener('click', this._onPrev);
        this.nextBtn.removeEventListener('click', this._onNext);
        this.wireframeInput.removeEventListener('change', this._onWireframe);
        this.edgesInput.removeEventListener('change', this._onEdges);
        this.colorModeSelect.removeEventListener('change', this._onColorMode);
        this.copyBtn.removeEventListener('click', this._onCopy);
    }
}
