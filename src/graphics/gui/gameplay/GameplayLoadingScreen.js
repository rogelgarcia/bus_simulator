// Covers scene construction until assets and an actual gameplay frame are ready.
// @ts-check
export class GameplayLoadingScreen {
    /** @param {any} engine */
    constructor(engine) {
        this.engine = engine;
        this.revision = 0;
        this.root = null;
        this.unsubscribe = null;
        this.onKeyDown = event => {
            if (this.root?.contains(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
    }

    get active() { return this.root !== null; }

    /** @param {() => any} start @param {() => void} back */
    async show(start, back) {
        this.cancel();
        const revision = this.revision;
        const root = document.createElement('div');
        root.className = 'gameplay-loading';
        root.innerHTML = '<div class="gameplay-loading-status" role="status" aria-live="polite">Loading…</div>'
            + '<button class="gameplay-loading-back" type="button" hidden>Back to garage</button>';
        this.root = root;
        document.body.appendChild(root);
        root.querySelector('button').addEventListener('click', back);
        window.addEventListener('keydown', this.onKeyDown, { capture: true });
        try {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (revision !== this.revision) return;
            const state = start();
            await Promise.all([
                state.busModel?.userData?.readyPromise,
                state.city?.world?.readyPromise,
                this.engine.waitForLightingReady()
            ]);
            if (revision !== this.revision) return;
            this.unsubscribe = this.engine.addFrameListener(({ rendered }) => {
                const error = this.engine.getBakedLightingDebugInfo()?.view?.error;
                if (error) this.fail(new Error(error));
                else if (rendered) this.cancel();
            });
        } catch (error) {
            if (revision === this.revision) this.fail(error);
        }
    }

    fail(error) {
        console.error('[GameplayLoadingScreen] Scene loading failed.', error);
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.root.querySelector('[role="status"]').textContent = 'Unable to load the game.';
        const button = this.root.querySelector('button');
        button.hidden = false;
        button.focus();
    }

    cancel() {
        this.revision++;
        this.unsubscribe?.();
        this.unsubscribe = null;
        window.removeEventListener('keydown', this.onKeyDown, { capture: true });
        this.root?.remove();
        this.root = null;
    }
}
