// Serves the repo as static files for headless browser tests.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSingleByteRange } from './static_server_range.mjs';

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

function streamFileResponse(filePath, range, res) {
    return new Promise((resolve, reject) => {
        const source = createReadStream(
            filePath,
            range ? {start: range.start, end: range.end} : undefined
        );
        let settled = false;
        const finish = (error = null) => {
            if (settled) return;
            settled = true;
            source.removeListener('error', onSourceError);
            res.removeListener('finish', onFinish);
            res.removeListener('close', onClose);
            if (error) reject(error);
            else resolve();
        };
        const onSourceError = (error) => finish(error);
        const onFinish = () => finish();
        const onClose = () => {
            if (res.writableFinished) {
                finish();
                return;
            }
            source.destroy();
            const error = new Error('Client closed before the static response completed');
            error.code = 'ECONNRESET';
            finish(error);
        };
        source.once('error', onSourceError);
        res.once('finish', onFinish);
        res.once('close', onClose);
        source.pipe(res);
    });
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

        const range = parseSingleByteRange(req.headers.range, info.size);
        if (range?.satisfiable === false) {
            res.writeHead(416, {
                'accept-ranges': 'bytes',
                'content-range': `bytes */${info.size}`,
                'content-type': 'text/plain; charset=utf-8'
            });
            res.end('Range not satisfiable');
            return;
        }
        const headers = {
            'content-type': getMimeType(diskPath),
            'cache-control': 'no-store',
            'accept-ranges': 'bytes',
            'content-length': String(range?.length ?? info.size),
            ...(range ? {'content-range': `bytes ${range.start}-${range.end}/${info.size}`} : {})
        };
        res.writeHead(range ? 206 : 200, headers);
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        await streamFileResponse(diskPath, range, res);
    } catch (err) {
        const msg = err?.message ?? String(err);
        if (res.headersSent) {
            res.destroy(err);
            return;
        }
        if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not found');
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
