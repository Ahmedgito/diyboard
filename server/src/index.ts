import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import os from 'node:os';
import { extname, join, normalize } from 'node:path';
import type { ClaudeStats, GitHubStats, SystemStats, Toast } from '../../shared/types.ts';
import { AdbWatcher } from './adb.ts';
import { ClaudeCollector } from './claude.ts';
import { loadConfig, ROOT } from './config.ts';
import { GitHubCollector } from './github.ts';
import { SystemCollector } from './system.ts';

const VERSION = '0.1.0';
const config = loadConfig();
const DIST = join(ROOT, 'web', 'dist');

// ---------------------------------------------------------------- SSE hub
type Channel = 'claude' | 'github' | 'system';
const latest: Partial<Record<Channel, unknown>> = {};
const recentToasts: Toast[] = [];
const clients = new Set<ServerResponse>();

function send(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function publish(channel: Channel, data: unknown) {
  latest[channel] = data;
  for (const c of clients) send(c, channel, data);
}

let toastSeq = 0;
function toast(t: Omit<Toast, 'id' | 'at'>) {
  const full: Toast = { ...t, id: `${Date.now()}-${toastSeq++}`, at: Date.now() };
  recentToasts.push(full);
  if (recentToasts.length > 20) recentToasts.shift();
  console.log(`[toast] ${full.title}${full.detail ? ` — ${full.detail}` : ''}`);
  for (const c of clients) send(c, 'toast', full);
}

// ---------------------------------------------------------------- collectors
const system = new SystemCollector();
const claude = new ClaudeCollector(config.claudeProjectsDir);
const github = new GitHubCollector();
github.onToast = toast;
claude.onNewSession = (project) => toast({ kind: 'claude', title: 'New Claude Code session', detail: project });

const adb = new AdbWatcher({
  port: config.port,
  autoLaunch: config.autoLaunch,
  component: `${config.appPackage}/${config.appActivity}`,
  onConnect: () => {
    toast({ kind: 'tablet', title: 'Tablet connected' });
    publishSystem();
  },
  onDisconnect: () => publishSystem(),
});

function publishSystem() {
  const stats: SystemStats = {
    hostname: os.hostname(),
    cpu: system.cpu,
    cpuHistory: [...system.cpuHistory],
    ...system.memory(),
    uptime: os.uptime(),
    disk: system.disk,
    battery: system.battery,
    tablet: adb.serial ? { serial: adb.serial, connected: true } : null,
  };
  publish('system', stats);
}

const emptyClaude = (error: string): ClaudeStats => ({
  available: false,
  error,
  updatedAt: Date.now(),
  today: { cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0, sessions: 0 },
  hourlyOutput: new Array(24).fill(0),
  daily: [],
  models: [],
  projects: [],
  block: null,
  activity: { active: false, lastAt: null, project: null, branch: null, model: null, activeSessions: 0 },
  streakDays: 0,
  streakCapped: false,
  last30Cost: 0,
});

let claudeBusy = false;
let lastClaudePush = 0;
async function claudeLoop() {
  if (claudeBusy) return;
  claudeBusy = true;
  try {
    const changed = await claude.scan();
    const now = Date.now();
    // Push on new data, and at least every 20s so time windows (active, 5h block) roll over.
    if (changed || now - lastClaudePush > 20_000) {
      publish('claude', claude.snapshot(now));
      lastClaudePush = now;
    }
  } catch (err) {
    publish('claude', emptyClaude((err as Error).message));
  } finally {
    claudeBusy = false;
  }
}

async function githubLoop() {
  if (!config.githubEnabled) return;
  try {
    publish('github', await github.poll());
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[github] ${msg}`);
    const prev = latest.github as GitHubStats | undefined;
    publish('github', prev ? { ...prev, error: msg } : { available: false, error: msg, updatedAt: Date.now() });
  }
}

// ---------------------------------------------------------------- http
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Dashboard not built yet. Run `npm run build` on the laptop.');
  }
  const url = new URL(req.url ?? '/', 'http://x');
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
  if (rel.includes('..')) rel = '';
  let file = join(DIST, rel);
  if (!rel || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const isAsset = rel.startsWith('assets');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  res.setHeader('access-control-allow-origin', '*');

  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, version: VERSION }));
  }
  if (path === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ...latest, toasts: recentToasts, serverTime: Date.now() }));
  }
  if (path === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    send(res, 'hello', { serverTime: Date.now(), version: VERSION });
    for (const [ch, data] of Object.entries(latest)) send(res, ch, data);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  serveStatic(req, res);
});

setInterval(() => {
  for (const c of clients) c.write(`: ping ${Date.now()}\n\n`);
}, 15_000);

server.listen(config.port, () => {
  console.log(`\n  DIY Board server  →  http://localhost:${config.port}`);
  console.log(`  Claude logs       →  ${config.claudeProjectsDir}`);
  console.log(`  Tablet            →  plug in via USB (adb: ${adb.adb})\n`);

  system.sampleCpu();
  setInterval(() => {
    system.sampleCpu();
    publishSystem();
  }, 2000);
  Promise.all([system.sampleBattery(), system.sampleDisk()]).then(publishSystem);
  setInterval(() => {
    system.sampleBattery();
    system.sampleDisk();
  }, 60_000);

  publish('claude', emptyClaude('Reading Claude Code logs…'));
  claudeLoop();
  setInterval(claudeLoop, 4000);

  githubLoop();
  setInterval(githubLoop, Math.max(30, config.githubPollSeconds) * 1000);

  adb.start();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.port} is in use — is DIY Board already running?`);
  else console.error(err);
  process.exit(1);
});
