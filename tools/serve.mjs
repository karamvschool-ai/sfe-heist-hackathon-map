import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const port = Number(process.env.PORT || 4173);
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.jpg': 'image/jpeg',
};
const files = /^(?:index\.html|map\.js|walkthrough\.js|(?:core|vendor)\/[\w.-]+\.js|assets\/[\w.-]+\.(?:jpg|json))$/;

createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }
    const file = request.url?.split('?')[0].slice(1) || 'index.html';
    if (!files.test(file)) {
        response.writeHead(404).end();
        return;
    }
    try {
        const bytes = await readFile(new URL('../' + file, import.meta.url));
        response.writeHead(200, {
            'Content-Type': types[extname(file)],
            'Content-Length': bytes.length,
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
        });
        response.end(request.method === 'GET' ? bytes : undefined);
    } catch {
        response.writeHead(404).end();
    }
}).listen(port, '127.0.0.1', () => console.log(`SFE Heist map at http://127.0.0.1:${port}`));
