// Playwright config for deterministic visual regression screenshots.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const baseURL = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:4173';
const headless = process.env.HEADLESS === '0' ? false : true;

export default {
    testDir: path.resolve(__dirname, 'specs'),
    testMatch: '**/*.pwtest.js',
    timeout: 90_000,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    snapshotDir: path.resolve(__dirname, 'baselines'),
    outputDir: path.resolve(__dirname, '../../artifacts/headless/visual'),
    use: {
        baseURL,
        headless,
        viewport: { width: 960, height: 540 },
        deviceScaleFactor: 1,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        launchOptions: {
            args: [
                '--disable-dev-shm-usage',
                '--hide-scrollbars',
                '--mute-audio',
                '--force-color-profile=srgb',
                '--use-angle=swiftshader'
            ]
        }
    },
    webServer: process.env.VISUAL_BASE_URL ? undefined : {
        cwd: repoRoot,
        command: 'node tests/headless/e2e/static_server.mjs',
        url: `${baseURL}/__health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
};
