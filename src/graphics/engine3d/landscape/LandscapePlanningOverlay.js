// Owns authenticated planning metadata and budgeted optional guide buffers, independent of terrain authority.
// @ts-check
import * as THREE from 'three';
import { LANDSCAPE_PLANNING_ROLES, loadLandscapePlanningReferences } from '../../../app/landscape/LandscapePlanningReferences.js';
import { LANDSCAPE_STREAMING_BUDGETS } from '../../../app/landscape/LandscapeResidencyBudget.js';
import { buildLandscapePlanningPositions, landscapePlanningVertexCount } from './LandscapePlanningGeometry.js';

const LAYERS = Object.freeze({ districts: { kind: 'district', color: 0xe0c984 }, roads: { kind: 'road', color: 0xe7d4bc },
    shoreline: { kind: 'shoreline', color: 0x75dce6 }, points: { kind: 'point', color: 0xffb37b }, corridors: { kind: 'view-corridor', color: 0xb5c980 } });
export const LANDSCAPE_DIAGNOSTICS = Object.freeze(['none', 'elevation', 'slope', 'water']);

export class LandscapePlanningOverlay {
    constructor({ loaded, scene, budget, visibility = {}, diagnostic = 'none' }) {
        this.loaded = loaded; this.scene = scene; this.budget = budget; this.key = `planning/${crypto.randomUUID()}`;
        this.abort = new AbortController(); this.records = new Map(); this.features = []; this.errors = [];
        this.visible = Object.fromEntries(Object.keys(LAYERS).map(key => [key, visibility[key] ?? false]));
        this.diagnostic = diagnostic; this.ready = false; this.disposed = false; this.uploadedBytes = 0; this.peakUploadedBytes = 0;
        const root = loaded.chunk.descriptor;
        this.uniforms = { uDiagnostic: { value: LANDSCAPE_DIAGNOSTICS.indexOf(diagnostic) },
            uDiagnosticRange: { value: new THREE.Vector3(root.minHeight, root.maxHeight, loaded.manifest.coordinates.seaLevel) } };
    }

    async initialize() {
        const references = this.loaded.manifest.references.filter(value => LANDSCAPE_PLANNING_ROLES.includes(value.role));
        if (!references.length) { this.ready = true; return; }
        const sourceBytes = references.reduce((sum, reference) => sum + reference.byteLength, 0);
        const admission = this.budget.reserve(this.key, { cpuBytes: Math.max(1024, sourceBytes * 6), gpuBytes: 0, kind: 'planning-reference-staging' });
        if (!admission.admitted) { this.errors.push(`Planning references cannot fit: ${admission.reason}`); return; }
        try {
            const result = await loadLandscapePlanningReferences(this.loaded.manifest, { manifestUrl: this.loaded.manifestUrl, signal: this.abort.signal });
            if (this.disposed) return;
            this.features = result.features; this.sourceBytes = result.sourceBytes; this.dependency = result.dependency;
            const residentBytes = result.sourceBytes * 2 + result.numericBytes;
            const resident = this.budget.update(this.key, { cpuBytes: residentBytes, gpuBytes: 0, kind: 'planning-reference-resident' });
            if (!resident.admitted) throw new Error(`Planning reference residency cannot fit: ${resident.reason}`);
            this.ready = true; this.set(this.visible);
        } catch (error) {
            if (!this.disposed && error.name !== 'AbortError') this.errors.push(error.message);
            this.features = []; this.budget.release(this.key);
        }
    }

    set(options) {
        if (options.diagnostic !== undefined) {
            if (!LANDSCAPE_DIAGNOSTICS.includes(options.diagnostic)) throw new Error('Unknown landscape diagnostic');
            this.diagnostic = options.diagnostic; this.uniforms.uDiagnostic.value = LANDSCAPE_DIAGNOSTICS.indexOf(options.diagnostic);
        }
        for (const [name, layer] of Object.entries(LAYERS)) {
            if (options[name] === undefined) continue;
            if (typeof options[name] !== 'boolean') throw new Error(`Planning layer ${name} must be boolean`);
            this.visible[name] = options[name];
            if (!this.visible[name]) { this.remove(name); continue; }
            if (!this.ready || this.records.has(name)) continue;
            const features = this.features.filter(feature => feature.kind === layer.kind), bytes = landscapePlanningVertexCount(features) * 3 * 4;
            if (!bytes) continue;
            if (bytes > LANDSCAPE_STREAMING_BUDGETS.uploadBytesPerFrame) { this.visible[name] = false; this.errors.push(`${name} guide exceeds the per-frame upload budget`); continue; }
            const key = `${this.key}/${name}`, admission = this.budget.reserve(key, { cpuBytes: bytes, gpuBytes: bytes, kind: 'planning-guide-buffer' });
            if (!admission.admitted) { this.visible[name] = false; this.errors.push(`${name} guide cannot fit: ${admission.reason}`); continue; }
            const positions = buildLandscapePlanningPositions(features, this.loaded.chunk), geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const material = new THREE.LineBasicMaterial({ color: layer.color, transparent: true, opacity: .86, depthWrite: false, depthTest: false });
            const line = new THREE.LineSegments(geometry, material);
            line.name = `Landscape planning ${name}`; line.renderOrder = 7; line.visible = false; this.scene.add(line);
            this.records.set(name, { key, bytes, line, uploaded: false });
        }
    }

    update(allowance) {
        this.uploadedBytes = 0;
        for (const record of this.records.values()) {
            if (record.uploaded || record.bytes > allowance - this.uploadedBytes) continue;
            record.line.visible = true; record.uploaded = true; this.uploadedBytes += record.bytes;
        }
        this.peakUploadedBytes = Math.max(this.peakUploadedBytes, this.uploadedBytes);
        return this.uploadedBytes;
    }

    remove(name) {
        const record = this.records.get(name);
        if (!record) return;
        record.line.removeFromParent(); record.line.geometry.dispose(); record.line.material.dispose();
        record.line.geometry.deleteAttribute('position'); this.budget.release(record.key); this.records.delete(name);
    }

    snapshot() {
        const entries = this.budget.snapshot().entries.filter(entry => entry.key.startsWith(this.key));
        return { ready: this.ready, settled: ![...this.records.values()].some(record => !record.uploaded), sourceRevision: this.loaded.manifest.revision,
            features: this.features.map(feature => ({ id: feature.id, sourceId: feature.sourceId, name: feature.name, kind: feature.kind,
                classification: feature.classification, bounds: feature.bounds, metadata: feature.metadata, firstPoint: feature.geometry.points[0], source: feature.source })),
            visible: { ...this.visible }, diagnostic: this.diagnostic, errors: [...this.errors],
            accuracy: { guides: 'retained-source-XZ / overview-draped-height', diagnostics: 'displayed-terrain-LOD / approximate',
                overviewSpacingMeters: this.loaded.manifest.grid.spacingX * this.loaded.chunk.descriptor.sampleStride, contourIntervalMeters: 5 },
            cpuBytes: entries.reduce((sum, entry) => sum + entry.cpuBytes, 0), gpuBytes: entries.reduce((sum, entry) => sum + entry.gpuBytes, 0),
            uploadedBytesPerFrame: this.uploadedBytes, peakUploadedBytesPerFrame: this.peakUploadedBytes, dependency: this.dependency ?? [] };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.abort.abort();
        for (const name of [...this.records.keys()]) this.remove(name);
        this.features = []; this.budget.release(this.key);
    }
}
