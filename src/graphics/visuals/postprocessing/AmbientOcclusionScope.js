// Resolves effective AO without overwriting either lighting context's saved intent.
export function resolveAmbientOcclusionScope(settings, indirectEffective = false) {
    const scope = (indirectEffective ? settings.indirectScope : settings.scope) ?? (indirectEffective ? 'dynamic' : 'all');
    const dynamic = scope === 'dynamic';
    return {
        scope, indirectEffective, preferenceKey: indirectEffective ? 'indirectScope' : 'scope',
        enabled: settings.mode !== 'off',
        pipeline: dynamic ? { ...settings, mode: 'off', staticAo: { ...settings.staticAo, mode: 'off' },
            busContactShadow: { ...settings.busContactShadow, enabled: false } } : settings
    };
}
