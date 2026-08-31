// Exposes one complete inactive resource set for an atomic controller handoff and safe retirement.
// @ts-check

import { createRuntimeFailure, IlluminationRuntimeError } from './IlluminationRuntimeError.js';

function rejectedHandoff(result) {
    return result === false || (
        result
        && typeof result === 'object'
        && Object.prototype.hasOwnProperty.call(result, 'accepted')
        && result.accepted === false
    );
}

/** @param {Record<string, any>} options */
export function createStagedIlluminationResources({
    generation,
    plan,
    entries,
    registry,
    diagnostics,
    onLifecycle
}) {
    const resourceById = new Map(entries.map((entry) => [entry.id, entry.resource]));
    const publicEntries = Object.freeze(entries.map((entry) => Object.freeze({
        id: entry.id,
        required: entry.required,
        kind: entry.kind,
        resource: entry.resource
    })));
    let disposition = 'ready_to_commit';
    let handoffPromise = null;
    let disposalPromise = null;
    let committedValue;
    let commitAttempted = false;
    let commitError = null;

    function getResource(id) {
        return resourceById.get(id);
    }

    function hasResource(id) {
        return resourceById.has(id);
    }

    function retireOwnedResources(reason) {
        if (disposalPromise) return disposalPromise;
        const previousDisposition = disposition;
        const previousLifecycle = diagnostics.snapshot();
        disposition = 'retiring';
        disposalPromise = Promise.resolve().then(async () => {
            const cancellation = reason === 'cancelled' || reason === 'superseded';
            const preserveFailure = previousLifecycle.state === 'failed' || previousLifecycle.state === 'stale';
            diagnostics.setLifecycle({
                state: cancellation
                    ? 'fallback'
                    : preserveFailure
                        ? previousLifecycle.state
                        : previousDisposition === 'committed'
                            ? 'unavailable'
                            : 'fallback',
                phase: 'retiring',
                reason: preserveFailure ? previousLifecycle.reason : reason,
                causeState: preserveFailure ? previousLifecycle.causeState : null
            });
            onLifecycle('retiring', { reason });
            const errors = await diagnostics.measure('disposalMs', () => registry.disposeAll(reason));
            for (const entry of entries) diagnostics.recordResource(entry.id, { disposition: 'disposed' });
            disposition = 'disposed';
            diagnostics.setLifecycle({ phase: 'disposed', reason });
            onLifecycle('disposed', { reason, errors });
            return Object.freeze({
                reason,
                errors,
                diagnostics: diagnostics.snapshot()
            });
        });
        return disposalPromise;
    }

    const activationSnapshot = Object.freeze({
        id: `illumination-runtime/${generation}/${plan.id}`,
        generation,
        planId: plan.id,
        identity: plan.identity,
        metadata: plan.metadata,
        requiredResourceIds: plan.requiredResourceIds,
        resources: publicEntries,
        diagnostics: diagnostics.snapshot(),
        getResource,
        hasResource,
        deactivate: (reason = 'deactivated') => retireOwnedResources(reason)
    });

    function commitPrepared(commitAtFrameBoundary) {
        if (commitAttempted) {
            if (commitError) throw commitError;
            return committedValue;
        }
        if (typeof commitAtFrameBoundary !== 'function') {
            throw new TypeError('Atomic activation requires a synchronous frame-boundary commit function.');
        }
        commitAttempted = true;
        if (disposition !== 'ready_to_commit') {
            const code = disposition === 'disposed' || disposition === 'retiring'
                ? 'resource_set_disposed'
                : 'resource_set_not_ready';
            commitError = createRuntimeFailure(code, `Resource set '${plan.id}' cannot be activated from '${disposition}'.`, {
                phase: disposition === 'disposed' ? 'disposed' : 'ready_to_commit',
                reason: 'activation_rejected',
                context: { planId: plan.id, disposition }
            });
            throw commitError;
        }
        const endActivation = diagnostics.begin('activationMs');
        try {
            const result = commitAtFrameBoundary(activationSnapshot);
            if (result && typeof result.then === 'function') {
                throw createRuntimeFailure('resource_handoff_thenable', `Controller commit for resource set '${plan.id}' must be synchronous.`, {
                    phase: 'ready_to_commit',
                    reason: 'activation_rejected',
                    context: { planId: plan.id }
                });
            }
            if (rejectedHandoff(result)) {
                throw createRuntimeFailure('resource_handoff_rejected', `Controller rejected resource set '${plan.id}'.`, {
                    phase: 'ready_to_commit',
                    reason: 'activation_rejected',
                    context: { planId: plan.id }
                });
            }
            disposition = 'committed';
            committedValue = result;
            diagnostics.setLifecycle({ state: 'active', phase: 'committed', reason: null, causeState: null });
            for (const entry of entries) diagnostics.recordResource(entry.id, { disposition: 'resident' });
            onLifecycle('committed', { result });
            return result;
        } catch (caught) {
            commitError = caught instanceof IlluminationRuntimeError
                ? caught
                : createRuntimeFailure('resource_handoff_failed', `Controller handoff failed for resource set '${plan.id}'.`, {
                    phase: 'ready_to_commit',
                    reason: 'activation_failure',
                    context: { planId: plan.id },
                    cause: caught
                });
            diagnostics.setLifecycle({ state: commitError.state, reason: commitError.reason, causeState: commitError.state });
            onLifecycle('handoff_failed', { error: commitError });
            retireOwnedResources(commitError.reason).catch(() => {});
            throw commitError;
        } finally {
            endActivation();
        }
    }

    function handoff(commitAtFrameBoundary) {
        if (handoffPromise) return handoffPromise;
        try {
            handoffPromise = Promise.resolve(commitPrepared(commitAtFrameBoundary));
        } catch (error) {
            handoffPromise = Promise.reject(error);
        }
        return handoffPromise;
    }

    function dispose(reason = 'disposed') {
        if (disposalPromise) return disposalPromise;
        return retireOwnedResources(reason);
    }

    return Object.freeze({
        id: activationSnapshot.id,
        generation,
        planId: plan.id,
        activationSnapshot,
        resources: publicEntries,
        getResource,
        hasResource,
        commitPrepared,
        activateAtFrameBoundary: commitPrepared,
        handoff,
        deactivate: (reason = 'deactivated') => dispose(reason),
        reject: (reason = 'rejected') => dispose(reason),
        dispose,
        getDiagnostics: () => diagnostics.snapshot(),
        get disposition() {
            return disposition;
        },
        get committedValue() {
            return committedValue;
        }
    });
}
