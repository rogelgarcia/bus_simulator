// src/graphics/gui/map_debugger/MapDebuggerEditorPanel.js
// City/map spec editor panel for the map debugger view.

import { PickerPopup } from '../shared/PickerPopup.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_TRASH = 'M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z';
const ICON_STYLE = 'M12 3c4.97 0 9 3.13 9 7 0 2.08-1.17 3.86-3 5.1V18c0 1.66-1.34 3-3 3h-2.3c-.95 0-1.78-.53-2.2-1.3-.42-.77-1.25-1.3-2.2-1.3H8c-2.76 0-5-2.24-5-5 0-6.08 3.58-10.4 9-10.4zm0 2c-4.28 0-7 3.65-7 8.4 0 1.66 1.34 3 3 3h.3c1.66 0 3.11.93 3.83 2.3.13.24.37.4.67.4H15c.55 0 1-.45 1-1v-3.1l.5-.3c1.55-.95 2.5-2.45 2.5-4.2 0-2.63-3.13-5-7-5zm-4 6.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm4-1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm4 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z';

function makeIcon(pathD) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

function makeIconButton({ title, pathD, className = '' } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `map-debugger-icon-btn ${className}`.trim();
    btn.title = title || '';
    btn.setAttribute('aria-label', title || 'Action');
    btn.appendChild(makeIcon(pathD));
    return btn;
}

function makeBuildingConfigSections(configs) {
    const list = Array.isArray(configs) ? configs : [];
    return [{
        label: 'Catalog',
        options: list.map((cfg) => ({
            id: typeof cfg?.id === 'string' ? cfg.id : '',
            label: typeof cfg?.name === 'string' && cfg.name ? cfg.name : (cfg?.id ?? ''),
            kind: 'texture'
        }))
    }];
}

function resolveConfigLabel(configs, id) {
    const key = typeof id === 'string' ? id : '';
    const list = Array.isArray(configs) ? configs : [];
    const match = list.find((cfg) => cfg?.id === key) ?? null;
    if (match) return match?.name ?? match?.id ?? key;
    return key || '(none)';
}

export class MapDebuggerEditorPanel {
    constructor({
        spec = null,
        buildingConfigs = [],
        tab = 'road',
        roadParams = null,
        roadModeEnabled = false,
        roadDraftStart = null,
        buildingModeEnabled = false,
        buildingSelectionCount = 0,
        newBuildingConfigId = null,
        onApplyCity = null,
        onClearCity = null,
        onResetDemo = null,
        onRandomizeSeed = null,
        onTabChange = null,
        onRoadParamsChange = null,
        onStartRoadMode = null,
        onDoneRoadMode = null,
        onCancelRoadDraft = null,
        onRoadRenderedChange = null,
        onDeleteRoad = null,
        onStartBuildingMode = null,
        onDoneBuildingMode = null,
        onCancelBuildingMode = null,
        onClearBuildingSelection = null,
        onNewBuildingConfigIdChange = null,
        onBuildingRenderedChange = null,
        onDeleteBuilding = null,
        onBuildingConfigChange = null,
        onRoadHover = null,
        onBuildingHover = null
    } = {}) {
        this.root = document.createElement('div');
        this.root.className = 'map-debugger-panel map-debugger-editor-panel hidden';

        this.title = document.createElement('div');
        this.title.className = 'map-debugger-title';
        this.title.textContent = 'City editor';

        this.sections = document.createElement('div');
        this.sections.className = 'map-debugger-editor-sections';

        this.root.appendChild(this.title);
        this.root.appendChild(this.sections);

        this.createOverlay = document.createElement('div');
        this.createOverlay.className = 'map-debugger-create-overlay hidden';

        this.createPanel = document.createElement('div');
        this.createPanel.className = 'ui-panel is-interactive map-debugger-create-panel';

        this.createTitle = document.createElement('div');
        this.createTitle.className = 'ui-title is-inline map-debugger-create-title';
        this.createTitle.textContent = '';

        this.createText = document.createElement('div');
        this.createText.className = 'map-debugger-create-text';
        this.createText.textContent = '';

        this.createControls = document.createElement('div');
        this.createControls.className = 'map-debugger-create-controls';

        this.createActions = document.createElement('div');
        this.createActions.className = 'map-debugger-create-actions';

        this.createPanel.appendChild(this.createTitle);
        this.createPanel.appendChild(this.createText);
        this.createPanel.appendChild(this.createControls);
        this.createPanel.appendChild(this.createActions);
        this.createOverlay.appendChild(this.createPanel);

        this._spec = null;
        this._buildingConfigs = Array.isArray(buildingConfigs) ? buildingConfigs.slice() : [];
        this._tab = tab === 'building' ? 'building' : 'road';
        this._roadParams = {
            tag: 'road',
            lanesF: 1,
            lanesB: 1,
            ...(roadParams ?? {})
        };
        this._roadModeEnabled = !!roadModeEnabled;
        this._roadDraftStart = roadDraftStart && Number.isFinite(roadDraftStart?.x) && Number.isFinite(roadDraftStart?.y)
            ? { x: roadDraftStart.x | 0, y: roadDraftStart.y | 0 }
            : null;
        this._buildingModeEnabled = !!buildingModeEnabled;
        this._buildingSelectionCount = Math.max(0, Number(buildingSelectionCount) | 0);
        this._newBuildingConfigId = typeof newBuildingConfigId === 'string' ? newBuildingConfigId : (this._buildingConfigs[0]?.id ?? null);

        this._onApplyCity = onApplyCity;
        this._onClearCity = onClearCity;
        this._onResetDemo = onResetDemo;
        this._onRandomizeSeed = onRandomizeSeed;
        this._onTabChange = onTabChange;
        this._onRoadParamsChange = onRoadParamsChange;
        this._onStartRoadMode = onStartRoadMode;
        this._onDoneRoadMode = onDoneRoadMode;
        this._onCancelRoadDraft = onCancelRoadDraft;
        this._onRoadRenderedChange = onRoadRenderedChange;
        this._onDeleteRoad = onDeleteRoad;
        this._onStartBuildingMode = onStartBuildingMode;
        this._onDoneBuildingMode = onDoneBuildingMode;
        this._onCancelBuildingMode = onCancelBuildingMode;
        this._onClearBuildingSelection = onClearBuildingSelection;
        this._onNewBuildingConfigIdChange = onNewBuildingConfigIdChange;
        this._onBuildingRenderedChange = onBuildingRenderedChange;
        this._onDeleteBuilding = onDeleteBuilding;
        this._onBuildingConfigChange = onBuildingConfigChange;
        this._onRoadHover = onRoadHover;
        this._onBuildingHover = onBuildingHover;

        this._pickerPopup = new PickerPopup();
        this._pickerContext = null;

        this._buildCitySection();
        this._buildToolsSection();
        this._buildRoadsSection();
        this._buildBuildingsSection();
        this._buildExportSection();

        this.setSpec(spec);
        this.setTab(this._tab);
        this.setRoadParams(this._roadParams);
        this.setRoadModeEnabled(this._roadModeEnabled);
        this.setRoadDraftStart(this._roadDraftStart);
        this.setBuildingModeEnabled(this._buildingModeEnabled);
        this.setBuildingSelectionCount(this._buildingSelectionCount);
        this.setNewBuildingConfigId(this._newBuildingConfigId);
    }

    setSpec(spec) {
        this._spec = spec && typeof spec === 'object' ? spec : null;
        const citySeed = typeof this._spec?.seed === 'string' ? this._spec.seed : '';
        if (this.seedInput) this.seedInput.value = citySeed;
        if (this.widthInput) this.widthInput.value = String(this._spec?.width ?? '');
        if (this.heightInput) this.heightInput.value = String(this._spec?.height ?? '');

        const roads = Array.isArray(this._spec?.roads) ? this._spec.roads : [];
        this._renderRoads(roads);

        const buildings = Array.isArray(this._spec?.buildings) ? this._spec.buildings : [];
        this._renderBuildings(buildings);

        this._refreshExportText();
    }

    setTab(tab) {
        const next = tab === 'building' ? 'building' : 'road';
        this._tab = next;
        if (this.tabRoadBtn) this.tabRoadBtn.classList.toggle('is-active', next === 'road');
        if (this.tabBuildingBtn) this.tabBuildingBtn.classList.toggle('is-active', next === 'building');
        if (this.roadsSection) this.roadsSection.classList.toggle('hidden', next !== 'road');
        if (this.buildingsSection) this.buildingsSection.classList.toggle('hidden', next !== 'building');
        this._syncCreateButtons();
    }

    setRoadParams(params) {
        this._roadParams = { ...this._roadParams, ...(params ?? {}) };
        this._renderCreatePopup();
    }

    setRoadModeEnabled(enabled) {
        this._roadModeEnabled = !!enabled;
        this._renderCreatePopup();
        this._syncCreateButtons();
    }

    setRoadDraftStart(tile) {
        this._roadDraftStart = tile && Number.isFinite(tile.x) && Number.isFinite(tile.y) ? { x: tile.x | 0, y: tile.y | 0 } : null;
        this._renderCreatePopup();
    }

    setBuildingModeEnabled(enabled) {
        this._buildingModeEnabled = !!enabled;
        this._renderCreatePopup();
        this._syncCreateButtons();
    }

    setBuildingSelectionCount(count) {
        this._buildingSelectionCount = Math.max(0, Number(count) | 0);
        this._renderCreatePopup();
    }

    setBuildingConfigs(configs) {
        this._buildingConfigs = Array.isArray(configs) ? configs.slice() : [];
        if (!this._newBuildingConfigId) this._newBuildingConfigId = this._buildingConfigs[0]?.id ?? null;
        this._renderCreatePopup();
        this._syncCreateButtons();
        this._renderBuildings(Array.isArray(this._spec?.buildings) ? this._spec.buildings : []);
    }

    setNewBuildingConfigId(id) {
        this._newBuildingConfigId = typeof id === 'string' && id ? id : (this._buildingConfigs[0]?.id ?? null);
        this._renderCreatePopup();
    }

    attach(parent = document.body) {
        if (!this.root.isConnected) parent.appendChild(this.root);
    }

    show() {
        this.attach(document.body);
        this.root.classList.remove('hidden');
    }

    hide() {
        this.root.classList.add('hidden');
        this._hideCreatePopup();
    }

    destroy() {
        this._pickerPopup.dispose();
        this._hideCreatePopup({ remove: true });
        if (this.root.isConnected) this.root.remove();
    }

    _buildCitySection() {
        const section = this._makeSection('City');

        const bar = document.createElement('div');
        bar.className = 'map-debugger-city-bar';

        const seedLabel = document.createElement('span');
        seedLabel.className = 'map-debugger-city-label';
        seedLabel.textContent = 'Seed';
        bar.appendChild(seedLabel);

        this.seedInput = document.createElement('input');
        this.seedInput.type = 'text';
        this.seedInput.className = 'map-debugger-city-input';
        this.seedInput.placeholder = 'seed';
        bar.appendChild(this.seedInput);

        this.randomizeSeedBtn = document.createElement('button');
        this.randomizeSeedBtn.type = 'button';
        this.randomizeSeedBtn.className = 'map-debugger-city-btn';
        this.randomizeSeedBtn.textContent = 'Random';
        bar.appendChild(this.randomizeSeedBtn);

        const sep = document.createElement('span');
        sep.className = 'map-debugger-city-sep';
        sep.textContent = '|';
        bar.appendChild(sep);

        const tilesLabel = document.createElement('span');
        tilesLabel.className = 'map-debugger-city-label';
        tilesLabel.textContent = 'Tiles';
        bar.appendChild(tilesLabel);

        this.widthInput = document.createElement('input');
        this.widthInput.type = 'number';
        this.widthInput.min = '1';
        this.widthInput.step = '1';
        this.widthInput.className = 'map-debugger-city-input map-debugger-city-input-short';
        this.widthInput.placeholder = 'w';
        bar.appendChild(this.widthInput);

        this.heightInput = document.createElement('input');
        this.heightInput.type = 'number';
        this.heightInput.min = '1';
        this.heightInput.step = '1';
        this.heightInput.className = 'map-debugger-city-input map-debugger-city-input-short';
        this.heightInput.placeholder = 'h';
        bar.appendChild(this.heightInput);

        this.applyCityBtn = document.createElement('button');
        this.applyCityBtn.type = 'button';
        this.applyCityBtn.className = 'map-debugger-city-btn map-debugger-city-btn-primary';
        this.applyCityBtn.textContent = 'Apply';
        bar.appendChild(this.applyCityBtn);

        const extraActions = document.createElement('div');
        extraActions.className = 'map-debugger-city-extra-actions';

        this.clearCityBtn = document.createElement('button');
        this.clearCityBtn.type = 'button';
        this.clearCityBtn.className = 'map-debugger-city-btn';
        this.clearCityBtn.textContent = 'Clear';
        extraActions.appendChild(this.clearCityBtn);

        this.resetDemoBtn = document.createElement('button');
        this.resetDemoBtn.type = 'button';
        this.resetDemoBtn.className = 'map-debugger-city-btn';
        this.resetDemoBtn.textContent = 'Demo';
        extraActions.appendChild(this.resetDemoBtn);

        section.body.appendChild(bar);
        section.body.appendChild(extraActions);
        this.sections.appendChild(section.root);

        this.randomizeSeedBtn.addEventListener('click', () => {
            if (this._onRandomizeSeed) this._onRandomizeSeed();
        });

        this.applyCityBtn.addEventListener('click', () => {
            if (!this._onApplyCity) return;
            const widthStr = typeof this.widthInput?.value === 'string' ? this.widthInput.value.trim() : '';
            const heightStr = typeof this.heightInput?.value === 'string' ? this.heightInput.value.trim() : '';
            const width = widthStr ? Number(widthStr) : Number.NaN;
            const height = heightStr ? Number(heightStr) : Number.NaN;
            const seed = typeof this.seedInput?.value === 'string' ? this.seedInput.value : '';
            this._onApplyCity({ width, height, seed });
        });

        this.clearCityBtn.addEventListener('click', () => {
            if (this._onClearCity) this._onClearCity();
        });

        this.resetDemoBtn.addEventListener('click', () => {
            if (this._onResetDemo) this._onResetDemo();
        });
    }

    _buildToolsSection() {
        const section = this._makeSection('Tools');

        const row = document.createElement('div');
        row.className = 'map-debugger-tab-row';

        this.tabRoadBtn = document.createElement('button');
        this.tabRoadBtn.type = 'button';
        this.tabRoadBtn.className = 'map-debugger-editor-tool';
        this.tabRoadBtn.textContent = 'Road';
        row.appendChild(this.tabRoadBtn);

        this.tabBuildingBtn = document.createElement('button');
        this.tabBuildingBtn.type = 'button';
        this.tabBuildingBtn.className = 'map-debugger-editor-tool';
        this.tabBuildingBtn.textContent = 'Building';
        row.appendChild(this.tabBuildingBtn);

        section.body.appendChild(row);
        this.sections.appendChild(section.root);

        this.tabRoadBtn.addEventListener('click', () => this._emitTabChange('road'));
        this.tabBuildingBtn.addEventListener('click', () => this._emitTabChange('building'));
    }

    _emitTabChange(tab) {
        this.setTab(tab);
        if (this._onTabChange) this._onTabChange(this._tab);
    }

    _buildRoadsSection() {
        const section = this._makeSection('Roads');
        this.roadsSection = section.root;

        const actions = document.createElement('div');
        actions.className = 'map-debugger-editor-actions';

        this.createRoadBtn = document.createElement('button');
        this.createRoadBtn.type = 'button';
        this.createRoadBtn.className = 'map-debugger-editor-btn map-debugger-editor-btn-primary';
        this.createRoadBtn.textContent = 'Create Road';
        actions.appendChild(this.createRoadBtn);

        this.roadsWrap = document.createElement('div');
        this.roadsWrap.className = 'map-debugger-list map-debugger-editor-table-wrap';

        this.roadsTable = document.createElement('table');
        this.roadsTable.className = 'map-debugger-table';

        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        const headers = ['#', 'render', 'lanesF', 'lanesB', 'type', 'start', 'end', ''];
        for (const label of headers) {
            const th = document.createElement('th');
            th.textContent = label;
            tr.appendChild(th);
        }
        thead.appendChild(tr);
        this.roadsTbody = document.createElement('tbody');
        this.roadsTable.appendChild(thead);
        this.roadsTable.appendChild(this.roadsTbody);
        this.roadsWrap.appendChild(this.roadsTable);

        section.body.appendChild(actions);
        section.body.appendChild(this.roadsWrap);
        this.sections.appendChild(section.root);

        this.createRoadBtn.addEventListener('click', () => {
            if (this._onStartRoadMode) this._onStartRoadMode();
        });
    }

    _buildBuildingsSection() {
        const section = this._makeSection('Buildings');
        this.buildingsSection = section.root;

        const actions = document.createElement('div');
        actions.className = 'map-debugger-editor-actions';

        this.createBuildingBtn = document.createElement('button');
        this.createBuildingBtn.type = 'button';
        this.createBuildingBtn.className = 'map-debugger-editor-btn map-debugger-editor-btn-primary';
        this.createBuildingBtn.textContent = 'Create Building';
        actions.appendChild(this.createBuildingBtn);

        this.buildingsWrap = document.createElement('div');
        this.buildingsWrap.className = 'map-debugger-list map-debugger-editor-table-wrap';

        this.buildingsTable = document.createElement('table');
        this.buildingsTable.className = 'map-debugger-table';

        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        const headers = ['id', 'style', 'tiles', 'render', ''];
        for (const label of headers) {
            const th = document.createElement('th');
            th.textContent = label;
            tr.appendChild(th);
        }
        thead.appendChild(tr);
        this.buildingsTbody = document.createElement('tbody');
        this.buildingsTable.appendChild(thead);
        this.buildingsTable.appendChild(this.buildingsTbody);
        this.buildingsWrap.appendChild(this.buildingsTable);

        section.body.appendChild(actions);
        section.body.appendChild(this.buildingsWrap);
        this.sections.appendChild(section.root);

        this.createBuildingBtn.addEventListener('click', () => {
            if (this._onStartBuildingMode) this._onStartBuildingMode();
        });
    }

    _renderRoads(roads) {
        const list = Array.isArray(roads) ? roads : [];
        this.roadsTbody.textContent = '';

        list.forEach((road, index) => {
            const row = document.createElement('tr');

            const startX = road?.a?.[0] ?? 0;
            const startY = road?.a?.[1] ?? 0;
            const endX = road?.b?.[0] ?? 0;
            const endY = road?.b?.[1] ?? 0;

            const addCell = (value) => {
                const td = document.createElement('td');
                td.textContent = String(value);
                row.appendChild(td);
            };

            addCell(index);

            const tdRender = document.createElement('td');
            tdRender.className = 'map-debugger-row-toggle';
            const renderInput = document.createElement('input');
            renderInput.type = 'checkbox';
            renderInput.checked = road?.rendered !== false;
            renderInput.title = 'Rendered';
            tdRender.appendChild(renderInput);
            row.appendChild(tdRender);

            addCell(road?.lanesF ?? 0);
            addCell(road?.lanesB ?? 0);
            addCell(road?.tag ?? 'road');
            addCell(`${startX}:${startY}`);
            addCell(`${endX}:${endY}`);

            const tdActions = document.createElement('td');
            tdActions.className = 'map-debugger-row-actions';
            const delBtn = makeIconButton({ title: 'Delete', pathD: ICON_TRASH });
            tdActions.appendChild(delBtn);
            row.appendChild(tdActions);

            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._onDeleteRoad) this._onDeleteRoad(index);
            });

            renderInput.addEventListener('change', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._onRoadRenderedChange) this._onRoadRenderedChange(index, renderInput.checked);
            });

            row.addEventListener('mouseenter', () => {
                row.classList.add('map-debugger-row-hover');
                if (this._onRoadHover) this._onRoadHover(road, index);
            });
            row.addEventListener('mouseleave', () => {
                row.classList.remove('map-debugger-row-hover');
                if (this._onRoadHover) this._onRoadHover(null, index);
            });

            this.roadsTbody.appendChild(row);
        });
    }

    _renderBuildings(buildings) {
        const list = Array.isArray(buildings) ? buildings : [];
        this.buildingsTbody.textContent = '';

        list.forEach((building) => {
            const row = document.createElement('tr');

            const id = typeof building?.id === 'string' ? building.id : '';
            const configId = typeof building?.configId === 'string' ? building.configId : '';
            const tiles = Array.isArray(building?.tiles) ? building.tiles : [];

            const tdId = document.createElement('td');
            tdId.textContent = id || '(building)';
            row.appendChild(tdId);

            const tdStyle = document.createElement('td');
            const styleWrap = document.createElement('div');
            styleWrap.className = 'map-debugger-building-style-cell';
            const styleLabel = document.createElement('span');
            styleLabel.className = 'map-debugger-building-style-label';
            styleLabel.textContent = resolveConfigLabel(this._buildingConfigs, configId);
            styleWrap.appendChild(styleLabel);
            tdStyle.appendChild(styleWrap);
            row.appendChild(tdStyle);

            const tdTiles = document.createElement('td');
            tdTiles.textContent = String(tiles.length);
            row.appendChild(tdTiles);

            const tdRender = document.createElement('td');
            tdRender.className = 'map-debugger-row-toggle';
            const renderInput = document.createElement('input');
            renderInput.type = 'checkbox';
            renderInput.checked = building?.rendered !== false;
            renderInput.title = 'Rendered';
            tdRender.appendChild(renderInput);
            row.appendChild(tdRender);

            const tdActions = document.createElement('td');
            tdActions.className = 'map-debugger-row-actions';
            const styleBtn = makeIconButton({ title: 'Change style', pathD: ICON_STYLE });
            const delBtn = makeIconButton({ title: 'Delete', pathD: ICON_TRASH });
            tdActions.appendChild(styleBtn);
            tdActions.appendChild(delBtn);
            row.appendChild(tdActions);

            styleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!id) return;
                this._openBuildingStylePicker({
                    title: 'Select building style',
                    selectedId: configId,
                    onPick: (pickedId) => {
                        if (this._onBuildingConfigChange) this._onBuildingConfigChange({ buildingId: id, configId: pickedId });
                    }
                });
            });

            renderInput.addEventListener('change', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!id) return;
                if (this._onBuildingRenderedChange) this._onBuildingRenderedChange(id, renderInput.checked);
            });

            delBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!id) return;
                if (this._onDeleteBuilding) this._onDeleteBuilding(id);
            });

            row.addEventListener('mouseenter', () => {
                row.classList.add('map-debugger-row-hover');
                if (this._onBuildingHover) this._onBuildingHover(building);
            });
            row.addEventListener('mouseleave', () => {
                row.classList.remove('map-debugger-row-hover');
                if (this._onBuildingHover) this._onBuildingHover(null);
            });

            this.buildingsTbody.appendChild(row);
        });
    }

    _buildExportSection() {
        const section = this._makeSection('Export');

        const actions = document.createElement('div');
        actions.className = 'map-debugger-editor-actions';

        this.copyExportBtn = document.createElement('button');
        this.copyExportBtn.type = 'button';
        this.copyExportBtn.className = 'map-debugger-editor-btn map-debugger-editor-btn-primary';
        this.copyExportBtn.textContent = 'Copy';
        actions.appendChild(this.copyExportBtn);

        this.downloadExportBtn = document.createElement('button');
        this.downloadExportBtn.type = 'button';
        this.downloadExportBtn.className = 'map-debugger-editor-btn';
        this.downloadExportBtn.textContent = 'Download';
        actions.appendChild(this.downloadExportBtn);

        this.exportTextarea = document.createElement('textarea');
        this.exportTextarea.className = 'map-debugger-editor-export';
        this.exportTextarea.readOnly = true;
        this.exportTextarea.rows = 8;

        section.body.appendChild(actions);
        section.body.appendChild(this.exportTextarea);
        this.sections.appendChild(section.root);

        this.copyExportBtn.addEventListener('click', () => this._copyExport());
        this.downloadExportBtn.addEventListener('click', () => this._downloadExport());
    }

    _makeSection(title) {
        const root = document.createElement('div');
        root.className = 'map-debugger-editor-section';

        const header = document.createElement('div');
        header.className = 'map-debugger-editor-section-title';
        header.textContent = title;

        const body = document.createElement('div');
        body.className = 'map-debugger-editor-section-body';

        root.appendChild(header);
        root.appendChild(body);

        return { root, body };
    }

    _syncCreateButtons() {
        const creating = this._roadModeEnabled || this._buildingModeEnabled;
        const disableTab = creating;
        if (this.tabRoadBtn) this.tabRoadBtn.disabled = disableTab;
        if (this.tabBuildingBtn) this.tabBuildingBtn.disabled = disableTab;
        if (this.createRoadBtn) this.createRoadBtn.disabled = creating;
        if (this.createBuildingBtn) this.createBuildingBtn.disabled = creating;
    }

    _renderCreatePopup() {
        this.createControls.textContent = '';
        this.createActions.textContent = '';

        const creatingRoad = this._roadModeEnabled;
        const creatingBuilding = this._buildingModeEnabled;
        const show = creatingRoad || creatingBuilding;

        if (!show) {
            this._hideCreatePopup();
            return;
        }

        this._showCreatePopup();

        if (creatingRoad) this._renderRoadCreatePopup();
        if (creatingBuilding) this._renderBuildingCreatePopup();
    }

    _showCreatePopup() {
        if (!this.createOverlay.isConnected) document.body.appendChild(this.createOverlay);
        this.createOverlay.classList.remove('hidden');
    }

    _hideCreatePopup({ remove = false } = {}) {
        if (!this.createOverlay.isConnected) return;
        this.createOverlay.classList.add('hidden');
        if (remove) this.createOverlay.remove();
    }

    _renderRoadCreatePopup() {
        const start = this._roadDraftStart;
        this.createTitle.textContent = 'Create Road';

        if (!start) {
            this.createText.textContent = 'Select start tile.';
        } else {
            this.createText.textContent = `Select end tile (start: ${start.x}:${start.y}).`;
        }

        const controls = document.createElement('div');
        controls.className = 'map-debugger-create-grid map-debugger-create-grid-road';

        const tagWrap = document.createElement('div');
        tagWrap.className = 'map-debugger-create-field';
        const tagLabel = document.createElement('div');
        tagLabel.className = 'map-debugger-create-field-label';
        tagLabel.textContent = 'Type';
        this.roadTagInput = document.createElement('input');
        this.roadTagInput.type = 'text';
        this.roadTagInput.className = 'map-debugger-create-input';
        this.roadTagInput.value = this._roadParams.tag ?? 'road';
        tagWrap.appendChild(tagLabel);
        tagWrap.appendChild(this.roadTagInput);
        controls.appendChild(tagWrap);

        const makeLanesWrap = ({ label, value, onPick }) => {
            const wrap = document.createElement('div');
            wrap.className = 'map-debugger-create-field';
            const lbl = document.createElement('div');
            lbl.className = 'map-debugger-create-field-label';
            lbl.textContent = label;
            const row = document.createElement('div');
            row.className = 'map-debugger-lane-buttons';
            for (const n of [1, 2, 3]) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'map-debugger-lane-btn';
                btn.textContent = String(n);
                btn.classList.toggle('is-active', (value | 0) === n);
                btn.addEventListener('click', () => onPick(n));
                row.appendChild(btn);
            }
            wrap.appendChild(lbl);
            wrap.appendChild(row);
            return wrap;
        };

        const lanesFValue = Number.isFinite(this._roadParams.lanesF) ? this._roadParams.lanesF : 1;
        const lanesBValue = Number.isFinite(this._roadParams.lanesB) ? this._roadParams.lanesB : 1;

        controls.appendChild(makeLanesWrap({
            label: 'Lanes forward',
            value: lanesFValue,
            onPick: (n) => {
                if (this._onRoadParamsChange) this._onRoadParamsChange({ ...this._roadParams, lanesF: n });
            }
        }));

        controls.appendChild(makeLanesWrap({
            label: 'Lanes backward',
            value: lanesBValue,
            onPick: (n) => {
                if (this._onRoadParamsChange) this._onRoadParamsChange({ ...this._roadParams, lanesB: n });
            }
        }));

        this.createControls.appendChild(controls);

        this.roadTagInput.addEventListener('change', () => {
            if (!this._onRoadParamsChange) return;
            const tag = typeof this.roadTagInput?.value === 'string' ? this.roadTagInput.value.trim() : 'road';
            this._onRoadParamsChange({ ...this._roadParams, tag: tag || 'road' });
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'map-debugger-editor-btn';
        cancelBtn.textContent = 'Cancel segment';
        cancelBtn.disabled = !start;
        this.createActions.appendChild(cancelBtn);
        cancelBtn.addEventListener('click', () => {
            if (this._onCancelRoadDraft) this._onCancelRoadDraft();
        });

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'map-debugger-editor-btn map-debugger-editor-btn-primary';
        doneBtn.textContent = 'Done';
        this.createActions.appendChild(doneBtn);
        doneBtn.addEventListener('click', () => {
            if (this._onDoneRoadMode) this._onDoneRoadMode();
        });
    }

    _renderBuildingCreatePopup() {
        const count = this._buildingSelectionCount;
        const configId = this._newBuildingConfigId;
        const configLabel = resolveConfigLabel(this._buildingConfigs, configId);

        this.createTitle.textContent = 'Create Building';
        this.createText.textContent = count > 0
            ? `Select tiles (click to add/remove). Selected: ${count}.`
            : 'Select tiles (click to add/remove).';

        const controls = document.createElement('div');
        controls.className = 'map-debugger-create-grid';

        const styleWrap = document.createElement('div');
        styleWrap.className = 'map-debugger-create-field map-debugger-create-field-wide';
        const styleLabel = document.createElement('div');
        styleLabel.className = 'map-debugger-create-field-label';
        styleLabel.textContent = 'Style';
        const styleBtn = document.createElement('button');
        styleBtn.type = 'button';
        styleBtn.className = 'map-debugger-create-style-btn';
        styleBtn.textContent = configLabel;
        styleWrap.appendChild(styleLabel);
        styleWrap.appendChild(styleBtn);
        controls.appendChild(styleWrap);

        this.createControls.appendChild(controls);

        styleBtn.addEventListener('click', () => {
            this._openBuildingStylePicker({
                title: 'Select building style',
                selectedId: configId,
                onPick: (pickedId) => {
                    if (this._onNewBuildingConfigIdChange) this._onNewBuildingConfigIdChange(pickedId);
                }
            });
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'map-debugger-editor-btn';
        cancelBtn.textContent = 'Cancel building';
        this.createActions.appendChild(cancelBtn);
        cancelBtn.addEventListener('click', () => {
            if (this._onCancelBuildingMode) this._onCancelBuildingMode();
        });

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'map-debugger-editor-btn';
        clearBtn.textContent = 'Clear selection';
        clearBtn.disabled = count <= 0;
        this.createActions.appendChild(clearBtn);
        clearBtn.addEventListener('click', () => {
            if (this._onClearBuildingSelection) this._onClearBuildingSelection();
        });

        const buildBtn = document.createElement('button');
        buildBtn.type = 'button';
        buildBtn.className = 'map-debugger-editor-btn map-debugger-editor-btn-primary';
        buildBtn.textContent = 'Build';
        buildBtn.disabled = count <= 0;
        this.createActions.appendChild(buildBtn);
        buildBtn.addEventListener('click', () => {
            if (this._onDoneBuildingMode) this._onDoneBuildingMode();
        });
    }

    _openBuildingStylePicker({ title, selectedId, onPick } = {}) {
        const sections = makeBuildingConfigSections(this._buildingConfigs);
        this._pickerContext = { onPick: typeof onPick === 'function' ? onPick : null };
        this._pickerPopup.open({
            title: title || 'Select',
            sections,
            selectedId: typeof selectedId === 'string' ? selectedId : null,
            onSelect: (opt) => {
                const pickedId = opt?.id ?? null;
                const ctx = this._pickerContext;
                this._pickerContext = null;
                if (pickedId && ctx?.onPick) ctx.onPick(pickedId);
            }
        });
    }

    _buildExportText() {
        const spec = this._spec ?? null;
        if (!spec) return '';
        try {
            return JSON.stringify(spec, null, 2);
        } catch (err) {
            return String(err?.message ?? err);
        }
    }

    _refreshExportText() {
        if (!this.exportTextarea) return;
        this.exportTextarea.value = this._buildExportText();
    }

    async _copyExport() {
        this._refreshExportText();
        const text = this.exportTextarea?.value ?? '';
        if (!text) return;

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return;
            } catch (e) {
                // fall through
            }
        }

        this.exportTextarea.focus();
        this.exportTextarea.select();
        try {
            document.execCommand('copy');
        } catch (e) {
            // ignore
        }
    }

    _downloadExport() {
        this._refreshExportText();
        const text = this.exportTextarea?.value ?? '';
        if (!text) return;

        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'city_spec.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
}
