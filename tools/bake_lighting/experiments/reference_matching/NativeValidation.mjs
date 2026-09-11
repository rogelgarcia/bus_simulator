// Reuse the calibrated native transport fixtures at the accepted afternoon angle.
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { authenticated, receipt, resultFiles } from '../lighting_configurations/StageInputs.mjs';
import { captureGame } from '../daylight_calibration/Capture.mjs';
import { writeJson, listFiles } from '../../../baking/Files.mjs';
import { CALIBRATED_DAYLIGHT } from '../../../../src/graphics/lighting/CalibratedDaylight.js';
import { outputPath, TOOL } from './Baseline.mjs';

export async function nativeValidation(ctx) {
    if (ctx.publish || !ctx.options.output || !ctx.options['source-run']) throw new Error('New output and authenticated afternoon source required');
    const source = path.resolve(ctx.root, ctx.options['source-run']);
    await authenticated(path.join(source, 'afternoon_receipt.json'));
    const output = outputPath(ctx.root, ctx.options.output);
    await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
    const measurements = JSON.parse(await readFile(path.join(source, 'measurements.json'), 'utf8'));
    const profile = measurements.profiles.find(p => p.id === 'E55');
    if (!profile || !measurements.checks.every(check => check.passed)) throw new Error('Afternoon reference validation failed');
    await writeJson(path.join(output, 'request.json'), { source, profile, calibrated: CALIBRATED_DAYLIGHT });
    const script = path.join(ctx.root, TOOL, 'native_validation.py');
    await ctx.process(ctx.config.pythonExecutable, [script, output, 'prepare']);
    await captureGame(ctx, output, {});
    await ctx.process(ctx.config.pythonExecutable, [script, output, 'analyze']);
    const file = path.join(output, 'native_receipt.json');
    return resultFiles(await receipt(file, ctx.key, { output }, await listFiles(output)), file);
}
