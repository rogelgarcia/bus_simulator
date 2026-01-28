// src/graphics/gui/building_fabrication/mini_controllers/TextureTilingMiniController.js
// Texture tiling mini controller used by building fabrication UI.
import { clampNumber, formatFixed } from './RangeNumberUtils.js';
import { createDetailsSection, createHint, createSectionLabel } from './UiMiniControlPrimitives.js';
import { createRangeNumberRowController } from './RangeNumberRowController.js';
import { createToggleRowController } from './ToggleRowController.js';

export function createTextureTilingMiniController({
    mode = 'details',
    title = 'Texture tiling',
    detailsOpenByKey = null,
    detailsKey = null,
    allow = true,
    isActive = null,
    tiling,
    defaults = {},
    hintText = '',
    onChange = null
} = {}) {
    const cfg = tiling && typeof tiling === 'object' ? tiling : {};
    cfg.enabled ??= false;
    cfg.tileMeters ??= Number.isFinite(defaults.tileMeters) ? defaults.tileMeters : 2.0;
    cfg.tileMetersU ??= Number.isFinite(cfg.tileMetersU) ? cfg.tileMetersU : cfg.tileMeters;
    cfg.tileMetersV ??= Number.isFinite(cfg.tileMetersV) ? cfg.tileMetersV : cfg.tileMeters;
    cfg.uvEnabled ??= false;
    cfg.offsetU ??= 0.0;
    cfg.offsetV ??= 0.0;
    cfg.rotationDegrees ??= 0.0;

    const onChangeFn = typeof onChange === 'function' ? onChange : null;
    const disposables = [];

    const nodes = [];
    let detailsSection = null;
    let body = null;

    if (mode === 'details') {
        detailsSection = createDetailsSection(title, { open: false, nested: true, key: detailsKey, detailsOpenByKey });
        nodes.push(detailsSection.details);
        body = detailsSection.body;
    } else {
        const label = createSectionLabel(title);
        nodes.push(label);
        body = null;
    }

    const tileOverrideToggle = createToggleRowController({
        label: 'Override tile meters',
        checked: !!cfg.enabled,
        disabled: !allow,
        onChange: (checked) => {
            cfg.enabled = !!checked;
            syncDisabled();
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(tileOverrideToggle.toggle);
    else nodes.push(tileOverrideToggle.toggle);
    disposables.push(tileOverrideToggle);

    const tileMetersURow = createRangeNumberRowController({
        label: 'Tile meters U',
        min: 0.25,
        max: 20,
        step: 0.25,
        value: cfg.tileMetersU,
        disabled: !allow || !cfg.enabled,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, 0.25, 20.0),
        onChange: (next) => {
            cfg.tileMetersU = next;
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(tileMetersURow.row);
    else nodes.push(tileMetersURow.row);
    disposables.push(tileMetersURow);

    const tileMetersVRow = createRangeNumberRowController({
        label: 'Tile meters V',
        min: 0.01,
        max: 20,
        step: 0.01,
        value: cfg.tileMetersV,
        disabled: !allow || !cfg.enabled,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, 0.01, 20.0),
        onChange: (next) => {
            cfg.tileMetersV = next;
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(tileMetersVRow.row);
    else nodes.push(tileMetersVRow.row);
    disposables.push(tileMetersVRow);

    const uvToggle = createToggleRowController({
        label: 'Enable UV transform',
        checked: !!cfg.uvEnabled,
        disabled: !allow,
        onChange: (checked) => {
            cfg.uvEnabled = !!checked;
            syncDisabled();
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(uvToggle.toggle);
    else nodes.push(uvToggle.toggle);
    disposables.push(uvToggle);

    const offsetURow = createRangeNumberRowController({
        label: 'U offset (tiles)',
        min: -10,
        max: 10,
        step: 0.01,
        value: cfg.offsetU,
        disabled: !allow || !cfg.uvEnabled,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, -10.0, 10.0),
        onChange: (next) => {
            cfg.offsetU = next;
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(offsetURow.row);
    else nodes.push(offsetURow.row);
    disposables.push(offsetURow);

    const offsetVRow = createRangeNumberRowController({
        label: 'V offset (tiles)',
        min: -10,
        max: 10,
        step: 0.01,
        value: cfg.offsetV,
        disabled: !allow || !cfg.uvEnabled,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, -10.0, 10.0),
        onChange: (next) => {
            cfg.offsetV = next;
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(offsetVRow.row);
    else nodes.push(offsetVRow.row);
    disposables.push(offsetVRow);

    const rotationRow = createRangeNumberRowController({
        label: 'Rotation (deg)',
        min: -180,
        max: 180,
        step: 1,
        value: cfg.rotationDegrees,
        disabled: !allow || !cfg.uvEnabled,
        formatNumber: (v) => String(Math.round(Number(v) || 0)),
        clamp: (v) => clampNumber(v, -180.0, 180.0),
        onChange: (next) => {
            cfg.rotationDegrees = next;
            onChangeFn?.();
        }
    });
    if (body) body.appendChild(rotationRow.row);
    else nodes.push(rotationRow.row);
    disposables.push(rotationRow);

    if (hintText) {
        const hint = createHint(hintText);
        if (body) body.appendChild(hint);
        else nodes.push(hint);
    }

    const syncDisabled = () => {
        const active = typeof isActive === 'function' ? !!isActive() : true;
        tileOverrideToggle.setDisabled(!allow || !active);
        uvToggle.setDisabled(!allow || !active);
        tileMetersURow.setDisabled(!allow || !active || !cfg.enabled);
        tileMetersVRow.setDisabled(!allow || !active || !cfg.enabled);
        offsetURow.setDisabled(!allow || !active || !cfg.uvEnabled);
        offsetVRow.setDisabled(!allow || !active || !cfg.uvEnabled);
        rotationRow.setDisabled(!allow || !active || !cfg.uvEnabled);
    };

    syncDisabled();

    const mount = (parent, { before = null } = {}) => {
        const target = parent && typeof parent.appendChild === 'function' ? parent : null;
        if (!target) return;
        for (const node of nodes) {
            if (!node) continue;
            if (before && typeof target.insertBefore === 'function') target.insertBefore(node, before);
            else target.appendChild(node);
        }
    };

    const unmount = () => {
        for (const node of nodes) {
            if (node?.isConnected) node.remove();
        }
    };

    const dispose = () => {
        for (const d of disposables) d?.dispose?.();
        disposables.length = 0;
        unmount();
    };

    return {
        nodes,
        details: detailsSection?.details ?? null,
        syncDisabled,
        mount,
        unmount,
        dispose
    };
}
