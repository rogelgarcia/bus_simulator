// Verifies bounded receiver copies and real-browser WebCrypto snapshot semantics.
import { test, expect } from '@playwright/test';

test('Validation hashes snapshot borrowed views before mutation and never detach the owner', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { rawSha256Hex } = await import('/src/app/illumination/package/RawSha256.js');
        const { sha256Hex } = await import('/src/app/illumination/bake_source/Hashing.js');
        const source = new Uint8Array(1024 * 1024 + 16).fill(23), view = source.subarray(8, -8);
        const expected = await Promise.all([rawSha256Hex(view), sha256Hex('fixture', view)]);
        const pending = Promise.all([rawSha256Hex(view), sha256Hex('fixture', view)]);
        source.fill(7);
        return { same: JSON.stringify(await pending) === JSON.stringify(expected), attached: source.length, value: view[0] };
    });
    expect(result).toEqual({ same: true, attached: 1024 * 1024 + 16, value: 7 });
});

test('Receiver assembly preserves all bytes and shared package aliases, with cancellation between budgets', async ({ page }) => {
    await page.goto('/tests/headless/harness/index.html');
    const result = await page.evaluate(async () => {
        const { createReceiverBufferAssembly } = await import('/src/graphics/illumination/receiver_lightmaps/ReceiverBufferAssembly.js');
        const source = new Uint8Array(18 * 1024 * 1024 + 8);
        for (let i = 0; i < source.length; i++) source[i] = i % 251;
        const alias = source.subarray(4, -4), target = new Uint8Array(alias.length + 16).fill(255);
        const copy = createReceiverBufferAssembly(new AbortController().signal);
        await copy.copy(target, alias, 8);
        const same = alias.every((value, i) => target[i + 8] === value);
        const controller = new AbortController(), abortedTarget = new Uint8Array(alias.length);
        const task = createReceiverBufferAssembly(controller.signal).copy(abortedTarget, alias, 0);
        controller.abort();
        const cancelled = await task.then(() => false, error => error.name === 'AbortError');
        return { same, cancelled, untouchedEnd: abortedTarget.at(-1) === 0, attached: source.length,
            guards: target[0] === 255 && target.at(-1) === 255,
            bounded: copy.metrics.bytes === alias.length && copy.metrics.batches === 18 };
    });
    expect(result).toEqual({ same: true, cancelled: true, untouchedEnd: true, attached: 18 * 1024 * 1024 + 8, guards: true, bounded: true });
});
