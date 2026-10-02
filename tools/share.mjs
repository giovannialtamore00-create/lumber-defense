// Serves the built game (dist/) and opens a public Cloudflare tunnel to it, for playtests with friends.
//   npm run share            (builds first, then runs this)
// Prints the local and public links. Ctrl+C stops both. Needs cloudflared installed.
import { spawn } from 'node:child_process';
import { existsSync, readFile } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve('dist');
const port = Number(process.env.PORT) || 4180;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// "/" and invite links ("/?room=CODE") serve index.html.
http
  .createServer((req, res) => {
    let rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    readFile(file, (err, data) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(data)));
  })
  .listen(port, () => console.log(`Local:  http://localhost:${port}`));

const candidates = ['cloudflared', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'];
const bin = candidates.find((c) => c === 'cloudflared' || existsSync(c));
const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`]);
let shown = false;
const watch = (chunk) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk))?.[0];
  if (url && !shown) {
    shown = true;
    console.log(`Public: ${url}   (send this to friends; it can take a minute to start working)`);
  }
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);
tunnel.on('error', () => console.log('Could not start cloudflared. Install it, or share http://localhost:' + port + ' on your own network.'));
process.on('SIGINT', () => {
  tunnel.kill();
  process.exit(0);
});
