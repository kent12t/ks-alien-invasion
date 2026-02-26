/**
 * Alien Invasion - Combined HTTP + WebSocket + UDP Server
 *
 * - Serves static game files over HTTP (port 8080)
 * - Exposes a WebSocket endpoint at ws://localhost:8080 for the browser
 * - Listens for UDP packets on port 41234 (configurable via UDP_PORT env var)
 *
 * UDP trigger format (plain text, UTF-8):
 *   "start"  → starts the game (equivalent to mouse click on IDLE screen)
 *
 * Example send command (PowerShell):
 *   $udp = New-Object System.Net.Sockets.UdpClient
 *   $bytes = [System.Text.Encoding]::UTF8.GetBytes("start")
 *   $udp.Send($bytes, $bytes.Length, "127.0.0.1", 41234)
 *   $udp.Close()
 *
 * Example send command (Node.js one-liner):
 *   node -e "require('dgram').createSocket('udp4').send('start',41234,'127.0.0.1',(_,s)=>s.close())"
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { WebSocketServer } = require('ws');

// ─── Configuration ───────────────────────────────────────────────────────────
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 8080;
const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT) : 41234;
const SERVE_DIR = __dirname; // Serve files from project root

// ─── MIME Types ──────────────────────────────────────────────────────────────
const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
    // Strip query strings
    let urlPath = req.url.split('?')[0];

    // Default to index.html
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(SERVE_DIR, urlPath);

    // Security: prevent path traversal
    if (!filePath.startsWith(SERVE_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end(`404 Not Found: ${urlPath}`);
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Browser connected from ${ip}. Total clients: ${clients.size + 1}`);
    clients.add(ws);

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WS] Browser disconnected. Total clients: ${clients.size}`);
    });

    ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        clients.delete(ws);
    });
});

/** Broadcast a JSON message to all connected browser clients */
function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            ws.send(data);
        }
    }
    console.log(`[WS] Broadcast → ${data} (${clients.size} client(s))`);
}

// ─── UDP Server ───────────────────────────────────────────────────────────────
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    const raw = msg.toString('utf8').trim().toLowerCase();
    console.log(`[UDP] Received "${raw}" from ${rinfo.address}:${rinfo.port}`);

    switch (raw) {
        case 'start':
            broadcast({ command: 'start' });
            break;
        case 'reset':
            broadcast({ command: 'reset' });
            break;
        default:
            console.log(`[UDP] Unknown command: "${raw}" — ignored.`);
    }
});

udpServer.on('error', (err) => {
    console.error('[UDP] Error:', err.message);
    udpServer.close();
});

udpServer.on('listening', () => {
    const addr = udpServer.address();
    console.log(`[UDP] Listening on udp://0.0.0.0:${addr.port}`);
});

// ─── Start Everything ─────────────────────────────────────────────────────────
httpServer.listen(HTTP_PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        Alien Invasion Server — RUNNING           ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Game URL  : http://localhost:${HTTP_PORT}               ║`);
    console.log(`║  WebSocket : ws://localhost:${HTTP_PORT}                 ║`);
    console.log(`║  UDP Port  : ${UDP_PORT}                              ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  To trigger game start via UDP (PowerShell):     ║');
    console.log(`║  $u=New-Object Net.Sockets.UdpClient             ║`);
    console.log(`║  $b=[Text.Encoding]::UTF8.GetBytes("start")      ║`);
    console.log(`║  $u.Send($b,$b.Length,"127.0.0.1",${UDP_PORT})      ║`);
    console.log(`║  $u.Close()                                      ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    udpServer.bind(UDP_PORT);
});
