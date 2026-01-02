// src/graphics/gui/shared/utils/screenFade.js
// Provides full-screen fade transitions for state changes.
import { tween } from '../../../../app/utils/animate.js';

let _el = null;
let _stop = null;

function getEl() {
    if (_el) return _el;

    const el = document.createElement('div');
    el.id = 'ui-fade';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.background = '#000';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '999999';
    el.style.willChange = 'opacity';

    document.body.appendChild(el);
    _el = el;
    return _el;
}

function setOpacity(opacity, { blockInput = true } = {}) {
    const el = getEl();
    const o = Math.max(0, Math.min(1, opacity));
    el.style.opacity = String(o);

    // Optional input block while fading
    el.style.pointerEvents = blockInput && o > 0.001 ? 'auto' : 'none';
}

export function fadeTo({ opacity = 0, duration = 0.6, blockInput = true } = {}) {
    const el = getEl();

    // cancel any in-flight fade
    if (_stop) {
        _stop();
        _stop = null;
    }

    const from = parseFloat(el.style.opacity || '0') || 0;
    const to = Math.max(0, Math.min(1, opacity));

    // ensure it blocks input immediately if requested
    if (blockInput) el.style.pointerEvents = 'auto';

    return new Promise((resolve) => {
        _stop = tween({
            duration,
            onUpdate: (k) => {
                const v = from + (to - from) * k;
                setOpacity(v, { blockInput });
            },
            onComplete: () => {
                _stop = null;
                setOpacity(to, { blockInput });
                resolve();
            }
        });
    });
}

export function fadeOut({ duration = 0.6, blockInput = true } = {}) {
    return fadeTo({ opacity: 1, duration, blockInput });
}

export function fadeIn({ duration = 0.6 } = {}) {
    // Fade in should NOT block input once done
    return fadeTo({ opacity: 0, duration, blockInput: false });
}
