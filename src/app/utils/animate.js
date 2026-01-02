// src/app/utils/animate.js
export const easeInOutCubic = (x) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function tween({ duration = 1, onUpdate, easing = (x) => x, onComplete }) {
    const start = performance.now();
    let stopped = false;

    function frame(now) {
        if (stopped) return;
        const t = Math.min((now - start) / (duration * 1000), 1);
        onUpdate?.(easing(t), t);
        if (t < 1) requestAnimationFrame(frame);
        else onComplete?.();
    }

    requestAnimationFrame(frame);
    return () => { stopped = true; };
}
