// src/states/QMenuScreenRegistry.js
// Registry for grouped Q-menu navigation targets (Fabrication vs Debuggers).

import { DEBUG_TOOL_REGISTRY } from './DebugToolRegistry.js';
import { Q_MENU_GROUP, SCENE_SHORTCUT_REGISTRY } from './SceneShortcutRegistry.js';

const NOISE_FABRICATION_SCREEN = Object.freeze({
    id: 'noise_fabrication',
    key: '6',
    label: 'Noise Fabrication',
    description: 'Generate, preview, and save reusable noise recipes',
    href: 'debug_tools/noise_fabrication.html',
    qGroup: Q_MENU_GROUP.fabrication
});

const Q_MENU_GROUP_SHORTCUTS = Object.freeze([
    Object.freeze({
        id: Q_MENU_GROUP.fabrication,
        key: 'F',
        label: 'Fabrication',
        description: 'Game-content building tools (city, roads, buildings, materials)'
    }),
    Object.freeze({
        id: Q_MENU_GROUP.debuggers,
        key: 'D',
        label: 'Debuggers',
        description: 'Diagnostics, isolated repro scenes, and inspection tools'
    })
]);

function normalizeKey(key) {
    return typeof key === 'string' ? key.trim().toUpperCase() : '';
}

function compareByShortcutKey(a, b) {
    const aKey = normalizeKey(a?.key);
    const bKey = normalizeKey(b?.key);
    const aNum = Number.parseInt(aKey, 10);
    const bNum = Number.parseInt(bKey, 10);
    const aIsNum = Number.isFinite(aNum) && String(aNum) === aKey;
    const bIsNum = Number.isFinite(bNum) && String(bNum) === bKey;
    if (aIsNum && bIsNum) return aNum - bNum;
    return aKey.localeCompare(bKey);
}

function toScreenEntry(entry) {
    return Object.freeze({
        id: String(entry?.id ?? ''),
        key: String(entry?.key ?? ''),
        label: String(entry?.label ?? ''),
        description: String(entry?.description ?? ''),
        href: String(entry?.href ?? '')
    });
}

const FABRICATION_SCREENS = Object.freeze([
    ...SCENE_SHORTCUT_REGISTRY
        .filter((entry) => entry?.qGroup === Q_MENU_GROUP.fabrication && entry?.href)
        .map((entry) => toScreenEntry(entry)),
    toScreenEntry(NOISE_FABRICATION_SCREEN)
].sort(compareByShortcutKey));

const DEBUGGER_SCREENS = Object.freeze([
    ...SCENE_SHORTCUT_REGISTRY
        .filter((entry) => entry?.qGroup === Q_MENU_GROUP.debuggers && entry?.href)
        .map((entry) => toScreenEntry(entry)),
    ...DEBUG_TOOL_REGISTRY.map((entry) => toScreenEntry(entry))
].sort(compareByShortcutKey));

const FABRICATION_QUICK_SHORTCUTS = Object.freeze(FABRICATION_SCREENS.map((entry) => ({
    key: normalizeKey(entry.key),
    href: entry.href
})).filter((entry) => entry.key && entry.href));

function mapMenuEntry(entry) {
    return {
        key: entry.key,
        label: entry.label,
        description: entry.description,
        state: entry.href
    };
}

export function getQMenuGroupShortcuts() {
    return Q_MENU_GROUP_SHORTCUTS;
}

export function getFabricationQMenuScreens() {
    return FABRICATION_SCREENS;
}

export function getDebuggerQMenuScreens() {
    return DEBUGGER_SCREENS;
}

export function getQMenuScreensByGroup(groupId) {
    if (groupId === Q_MENU_GROUP.debuggers) return getDebuggerQMenuScreens();
    return getFabricationQMenuScreens();
}

export function getQMenuGroupMenuItems() {
    return Q_MENU_GROUP_SHORTCUTS.map((entry) => ({
        key: entry.key,
        label: entry.label,
        description: entry.description,
        state: entry.id
    }));
}

export function getQMenuScreenMenuItemsByGroup(groupId) {
    return getQMenuScreensByGroup(groupId).map((entry) => mapMenuEntry(entry));
}

export function getQMenuQuickShortcutByKey(key) {
    const typed = normalizeKey(key);
    if (!typed) return null;
    const match = FABRICATION_QUICK_SHORTCUTS.find((entry) => entry.key === typed) ?? null;
    return match?.href ?? null;
}
