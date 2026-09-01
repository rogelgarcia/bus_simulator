// Serves the repo as static files for headless browser tests.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.js':
        case '.mjs': return 'text/javascript; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.gif': return 'image/gif';
        case '.ico': return 'image/x-icon';
        case '.hdr': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

function normalizeUrlPath(urlPath) {
    const raw = String(urlPath ?? '/');
    const clean = raw.split('?')[0].split('#')[0];
    const decoded = decodeURIComponent(clean);
    if (!decoded.startsWith('/')) return null;
    const normalized = path.posix.normalize(decoded);
    if (normalized.includes('..')) return null;
    return normalized;
}

function toDiskPath(urlPath) {
    const normalized = normalizeUrlPath(urlPath);
    if (!normalized) return null;
    const rel = normalized === '/' ? '/index.html' : normalized;
    const diskPath = path.join(ROOT, rel);
    const resolved = path.resolve(diskPath);
    if (!resolved.startsWith(ROOT)) return null;
    return resolved;
}

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 4173;

const server = http.createServer(async (req, res) => {
    try {
        const diskPath = toDiskPath(req.url);
        if (!diskPath) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Bad request');
            return;
        }

        if (req.url === '/__health') {
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }

        const info = await stat(diskPath);
        if (!info.isFile()) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'content-type': getMimeType(diskPath),
            'cache-control': 'no-store',
            'content-length': String(info.size)
        });
        await pipeline(createReadStream(diskPath), res);
    } catch (err) {
        const msg = err?.message ?? String(err);
        if (res.headersSent) {
            res.destroy(err);
            return;
        }
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Server error: ${msg}`);
    }
});

// The Lab scene loads several large tree assets as a burst. Keep the normal
// HTTP/1.1 connection alive long enough to stream all bodies with backpressure;
// opening a fresh socket for every response can surface completed transfers as
// ERR_ABORTED in Chrome DevTools under shared-machine contention.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(port, host, () => {
    console.log(`Static server: http://${host}:${port}/`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
