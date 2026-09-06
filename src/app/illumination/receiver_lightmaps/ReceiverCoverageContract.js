// Audits complete receiver coverage independently of atlas packing and scene transport.
// @ts-check

export const COMPLETE_RECEIVER_COVERAGE = 'complete-eligible-v1';

/** @param {any} atlas */
export function assertCompleteReceiverCoverage(atlas) {
    const coverage = atlas.coverage;
    if (atlas.profile.coverage !== COMPLETE_RECEIVER_COVERAGE || coverage?.schema !== 'bus-sim-receiver-coverage-v1'
        || coverage.policy !== COMPLETE_RECEIVER_COVERAGE || coverage.complete !== true
        || !Number.isInteger(coverage.eligibleTriangles) || coverage.eligibleTriangles < 1
        || coverage.mappedTriangles !== coverage.eligibleTriangles || coverage.mappedTriangles !== atlas.statistics.triangles
        || coverage.requiredPages !== atlas.pageCount || coverage.requiredPages > atlas.profile.maxPages
        || coverage.transport?.complete !== true || coverage.transport.excludedParticipantMappings !== 0
        || !Array.isArray(coverage.missingReceivers) || coverage.missingReceivers.length
        || !Array.isArray(coverage.failures) || coverage.failures.length) {
        throw new Error('Receiver publication requires complete eligible coverage; partial preview packages cannot be newly published.');
    }
    if (atlas.profile.irradianceRepresentation === 'surface-diffuse-v1') {
        const raster = coverage.raster;
        if (raster?.schema !== 'bus-sim-receiver-raster-coverage-v1'
            || raster.policy !== 'chart-isolated-nearest-sample-v1'
            || raster.triangles !== coverage.eligibleTriangles || raster.charts !== atlas.statistics.charts
            || raster.emptyCharts !== 0 || raster.missingReceiverSamples !== 0
            || !Array.isArray(raster.pages) || raster.pages.length !== atlas.pageCount
            || raster.pages.reduce((n, p) => n + p.triangles, 0) !== raster.triangles
            || raster.pages.reduce((n, p) => n + p.charts, 0) !== raster.charts
            || raster.pages.some((p, page) => p.page !== page || p.mips?.length !== atlas.profile.mipLevels
                || p.mips.some((m, mip) => m.mip !== mip || !/^[a-f0-9]{64}$/.test(m.sha256)
                    || m.bytes !== (atlas.profile.pageSize >> mip) ** 2 * 4))) {
            throw new Error('Receiver publication requires verified raster coverage, including chart padding and explicit mips.');
        }
    }
}

/** Bind the raster audit to the exact encoded page bytes authenticated by the package parser. */
export function assertReceiverRasterPage(mapping, descriptor) {
    if (mapping.profile.irradianceRepresentation !== 'surface-diffuse-v1' || descriptor.channelId !== 'indirect_irradiance') return;
    const proof = mapping.coverage.raster.pages[descriptor.coordinateTransform.page]?.mips[descriptor.mipLevel];
    if (!proof || proof.sha256 !== descriptor.decodedSha256 || proof.bytes !== descriptor.decodedByteLength) {
        throw new Error('Receiver page differs from its verified raster coverage.');
    }
}

export class ReceiverCoverageAudit {
    /** @param {any} manifest @param {any} profile */
    constructor(manifest, profile) {
        if (profile.coverage !== COMPLETE_RECEIVER_COVERAGE) throw new Error('Unknown receiver coverage policy.');
        if (profile.focus != null || profile.minimumChartArea != null) throw new Error('Complete coverage cannot use preview selection heuristics.');
        this.manifest = manifest;
        this.profile = profile;
        this.eligible = new Map();
        this.excluded = [];
        this.failures = [];
        this.degenerateTriangles = 0;
    }

    /** @param {any} mapping @param {string|null} reason */
    recordMapping(mapping, reason) {
        if (reason) this.excluded.push({ mappingId: mapping.id, objectId: mapping.objectId,
            instanceId: mapping.meshInstanceId, materialId: mapping.materialId, triangles: mapping.count / 3, reason });
        else this.eligible.set(mapping.id, { mapping, triangles: mapping.count / 3 });
    }

    /** @param {string} mappingId */
    recordDegenerate(mappingId) {
        this.eligible.get(mappingId).triangles--;
        this.degenerateTriangles++;
    }

    /** @param {any} chart */
    recordOversized(chart) {
        this.failures.push({ reason: 'chart_exceeds_page', chartId: chart.id, objectId: chart.objectId,
            instanceId: chart.instanceId, triangles: chart.triangles.length, width: chart.width, height: chart.height });
    }

    /** @param {any[]} charts @param {number} requiredPages */
    finish(charts, requiredPages) {
        const mapped = new Map();
        for (const chart of charts) mapped.set(chart.mappingId, (mapped.get(chart.mappingId) ?? 0) + chart.triangles.length);
        const receivers = [...this.eligible.values()].map(e => ({ mappingId: e.mapping.id, objectId: e.mapping.objectId, instanceId: e.mapping.meshInstanceId,
                expectedTriangles: e.triangles, mappedTriangles: mapped.get(e.mapping.id) ?? 0 }));
        const missingReceivers = receivers.filter(e => e.mappedTriangles !== e.expectedTriangles);
        const eligibleTriangles = [...this.eligible.values()].reduce((n, e) => n + e.triangles, 0);
        const mappedTriangles = charts.reduce((n, c) => n + c.triangles.length, 0);
        const failures = [...this.failures];
        if (requiredPages > this.profile.maxPages) failures.unshift({ reason: 'page_budget', requiredPages, availablePages: this.profile.maxPages });
        if (!eligibleTriangles) failures.push({ reason: 'no_eligible_receivers' });
        const receiverRanges = new Set([...this.eligible.values()].map(e => rangeKey(e.mapping)));
        const participants = this.manifest.participantMappings.filter(m => m.channelRelevance.indirect_irradiance === true);
        const excludedParticipants = this.manifest.participantMappings.filter(m => m.channelRelevance.indirect_irradiance !== true);
        const excludedMaterialIds = [...new Set(excludedParticipants.map(m => m.materialId))].sort();
        if (excludedParticipants.length) failures.push({ reason: 'unsupported_transport',
            participantMappings: excludedParticipants.length, materialIds: excludedMaterialIds });
        const report = { schema: 'bus-sim-receiver-coverage-v1', policy: COMPLETE_RECEIVER_COVERAGE,
            complete: failures.length === 0 && missingReceivers.length === 0,
            eligibleTriangles, mappedTriangles, degenerateTriangles: this.degenerateTriangles,
            requiredPages, availablePages: this.profile.maxPages, receivers, missingReceivers, excludedReceivers: this.excluded, failures,
            transport: { complete: excludedParticipants.length === 0, participantMappings: participants.length,
                nonReceiverParticipantMappings: participants.filter(m => !receiverRanges.has(rangeKey(m))).length,
                excludedParticipantMappings: excludedParticipants.length,
                excludedMaterialIds } };
        if (!report.complete) {
            const error = new Error(`Complete receiver coverage failed: ${requiredPages} pages required, ${this.profile.maxPages} available; ${missingReceivers.length} receiver ranges cannot be mapped; ${excludedMaterialIds.length} materials lack transport support. No partial atlas was produced.`);
            Object.assign(error, { code: 'receiver_coverage_incomplete', coverage: report });
            throw error;
        }
        return report;
    }
}

function rangeKey(mapping) {
    return JSON.stringify([mapping.meshInstanceId, mapping.start, mapping.count, mapping.materialId, mapping.materialIndex]);
}
