// Playwright config for headless browser integration tests.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const headless = process.env.HEADLESS === '0' ? false : true;
const isFileBaseUrl = baseURL.startsWith('file:');

export default {
    testDir: __dirname,
    testMatch: '**/*.pwtest.js',
    timeout: 60_000,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    outputDir: path.resolve(__dirname, '../../artifacts/headless/e2e'),
    use: {
        baseURL,
        headless,
        launchOptions: {
            args: isFileBaseUrl ? [
                '--allow-file-access-from-files',
                '--disable-web-security'
            ] : []
        },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    webServer: process.env.E2E_BASE_URL ? undefined : {
        cwd: repoRoot,
        command: 'node tests/headless/e2e/static_server.mjs',
        url: `${baseURL}/__health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
};
