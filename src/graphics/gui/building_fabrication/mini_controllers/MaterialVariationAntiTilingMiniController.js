// src/graphics/gui/building_fabrication/mini_controllers/MaterialVariationAntiTilingMiniController.js
// Material-variation anti-tiling mini controller used by building fabrication UI.
import { clampNumber, formatFixed } from './RangeNumberUtils.js';
import { applyTooltip, createDetailsSection } from './UiMiniControlPrimitives.js';
import { createRangeNumberRowController } from './RangeNumberRowController.js';
import { createToggleRowController } from './ToggleRowController.js';

export function createMaterialVariationAntiTilingMiniController({
    allow = true,
    detailsOpenByKey = null,
    detailsKey = null,
    parentEnabled = true,
    normalizedAntiTiling,
    targetMaterialVariation,
    labels = {},
    tooltips = {},
    offsetOrder = null,
    onChange = null
} = {}) {
    const cfg = targetMaterialVariation && typeof targetMaterialVariation === 'object' ? targetMaterialVariation : null;
    const normalized = normalizedAntiTiling && typeof normalizedAntiTiling === 'object' ? normalizedAntiTiling : null;
    if (!cfg || !normalized) {
        return {
            details: null,
            syncDisabled: () => {},
            mount: () => {},
            unmount: () => {},
            dispose: () => {}
        };
    }

    const onChangeFn = typeof onChange === 'function' ? onChange : null;
    const section = createDetailsSection('Anti-tiling', { open: false, nested: true, key: detailsKey, detailsOpenByKey });

    if (tooltips.group) applyTooltip(section.label, tooltips.group);

    const antiToggle = createToggleRowController({
        label: 'Enable anti-tiling',
        checked: !!normalized.enabled,
        disabled: !allow || !parentEnabled,
        tooltip: tooltips.enable ?? '',
        mustHave: true,
        onChange: (checked) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.enabled = !!checked;
            syncDisabled();
            onChangeFn?.();
        }
    });
    section.body.appendChild(antiToggle.toggle);

    const strengthRow = createRangeNumberRowController({
        label: 'Strength',
        min: 0,
        max: 1,
        step: 0.01,
        value: normalized.strength,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: tooltips.strength ?? '',
        mustHave: true,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, 0.0, 1.0),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.strength = next;
            onChangeFn?.();
        }
    });
    section.body.appendChild(strengthRow.row);

    const cellSizeRow = createRangeNumberRowController({
        label: 'Cell size (tiles)',
        min: 0.25,
        max: 20,
        step: 0.25,
        value: normalized.cellSize,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: tooltips.cellSize ?? '',
        mustHave: true,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, 0.25, 20.0),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.cellSize = next;
            onChangeFn?.();
        }
    });
    section.body.appendChild(cellSizeRow.row);

    const blendRow = createRangeNumberRowController({
        label: 'Blend width',
        min: 0,
        max: 0.49,
        step: 0.01,
        value: normalized.blendWidth,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: tooltips.blendWidth ?? '',
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, 0.0, 0.49),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.blendWidth = next;
            onChangeFn?.();
        }
    });
    section.body.appendChild(blendRow.row);

    const offsetULabel = typeof labels.offsetU === 'string' ? labels.offsetU : 'Horizontal shift';
    const offsetUtooltip = tooltips.offsetU ?? '';
    const offsetURow = createRangeNumberRowController({
        label: offsetULabel,
        min: -1,
        max: 1,
        step: 0.01,
        value: normalized.offsetU,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: offsetUtooltip,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, -1.0, 1.0),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.offsetU = next;
            onChangeFn?.();
        }
    });

    const offsetVLabel = typeof labels.offsetV === 'string' ? labels.offsetV : 'Vertical shift';
    const offsetVtooltip = tooltips.offsetV ?? '';
    const offsetVRow = createRangeNumberRowController({
        label: offsetVLabel,
        min: -1,
        max: 1,
        step: 0.01,
        value: normalized.offsetV,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: offsetVtooltip,
        formatNumber: (v) => formatFixed(v, 2),
        clamp: (v) => clampNumber(v, -1.0, 1.0),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.offsetV = next;
            onChangeFn?.();
        }
    });
    const order = Array.isArray(offsetOrder) ? offsetOrder : ['offsetV', 'offsetU'];
    const seen = new Set();
    for (const key of order) {
        if (key === 'offsetU' && !seen.has('offsetU')) {
            section.body.appendChild(offsetURow.row);
            seen.add('offsetU');
        }
        if (key === 'offsetV' && !seen.has('offsetV')) {
            section.body.appendChild(offsetVRow.row);
            seen.add('offsetV');
        }
    }
    if (!seen.has('offsetV')) section.body.appendChild(offsetVRow.row);
    if (!seen.has('offsetU')) section.body.appendChild(offsetURow.row);

    const rotationRow = createRangeNumberRowController({
        label: 'Rotation (deg)',
        min: 0,
        max: 45,
        step: 1,
        value: normalized.rotationDegrees,
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: tooltips.rotation ?? '',
        formatNumber: (v) => String(Math.round(Number(v) || 0)),
        clamp: (v) => clampNumber(v, 0.0, 45.0),
        onChange: (next) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.rotationDegrees = next;
            onChangeFn?.();
        }
    });
    section.body.appendChild(rotationRow.row);

    const qualityToggle = createToggleRowController({
        label: 'Quality mode',
        checked: normalized.mode === 'quality',
        disabled: !allow || !parentEnabled || !antiToggle.input.checked,
        tooltip: tooltips.quality ?? '',
        onChange: (checked) => {
            cfg.antiTiling ??= {};
            cfg.antiTiling.mode = checked ? 'quality' : 'fast';
            onChangeFn?.();
        }
    });
    section.body.appendChild(qualityToggle.toggle);

    const syncDisabled = ({ allow: nextAllow = allow, parentEnabled: nextParentEnabled = parentEnabled } = {}) => {
        allow = !!nextAllow;
        parentEnabled = !!nextParentEnabled;
        antiToggle.setDisabled(!allow || !parentEnabled);
        const antiOn = !!antiToggle.input.checked;
        strengthRow.setDisabled(!allow || !parentEnabled || !antiOn);
        cellSizeRow.setDisabled(!allow || !parentEnabled || !antiOn);
        blendRow.setDisabled(!allow || !parentEnabled || !antiOn);
        offsetURow.setDisabled(!allow || !parentEnabled || !antiOn);
        offsetVRow.setDisabled(!allow || !parentEnabled || !antiOn);
        rotationRow.setDisabled(!allow || !parentEnabled || !antiOn);
        qualityToggle.setDisabled(!allow || !parentEnabled || !antiOn);
    };

    syncDisabled();

    const mount = (parent, { before = null } = {}) => {
        const target = parent && typeof parent.appendChild === 'function' ? parent : null;
        if (!target) return;
        if (before && typeof target.insertBefore === 'function') target.insertBefore(section.details, before);
        else target.appendChild(section.details);
    };

    const unmount = () => {
        if (section.details.isConnected) section.details.remove();
    };

    const dispose = () => {
        antiToggle.dispose();
        strengthRow.dispose();
        cellSizeRow.dispose();
        blendRow.dispose();
        offsetURow.dispose();
        offsetVRow.dispose();
        rotationRow.dispose();
        qualityToggle.dispose();
        unmount();
    };

    return {
        details: section.details,
        syncDisabled,
        mount,
        unmount,
        dispose
    };
}
