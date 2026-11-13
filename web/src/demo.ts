// Fictional data for `/?demo`: screenshots and trying the UI without a laptop server.
import type { ClaudeStats, GitHubStats, PullRequest, SystemStats, Toast } from '../../shared/types.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function localKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// deterministic pseudo-random so screenshots are stable
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function demoClaude(now: number): ClaudeStats {
  const hour = new Date(now).getHours();
  const shape = [0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 42, 61, 30, 22, 74, 88, 66, 51, 12, 0, 9, 34, 20, 0];
  const hourlyOutput = shape.map((v, i) => (i <= hour ? v * 1400 : 0));
  const r = rng(7);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const daily = Array.from({ length: 14 }, (_, i) => {
    const t = todayStart - (13 - i) * DAY + 12 * HOUR;
    const weekend = [0, 6].includes(new Date(t).getDay());
    const cost = i === 13 ? 38.4 : weekend ? r() * 6 : 18 + r() * 42;
    return { date: localKey(t), cost, tokens: cost * 2.9e6 };
  });
  const blockStart = Math.floor((now - 2.6 * HOUR) / HOUR) * HOUR;
  return {
    available: true,
    updatedAt: now,
    today: {
      cost: 38.4,
      tokens: 112_400_000,
      inputTokens: 1_240,
      outputTokens: 412_000,
      cacheReadTokens: 109_800_000,
      cacheWriteTokens: 2_190_000,
      calls: 318,
      sessions: 5,
    },
    hourlyOutput,
    daily,
    models: [
      { model: 'Opus 5.5', family: 'opus', cost: 29.1, tokens: 84e6 },
      { model: 'Sonnet 5.5', family: 'sonnet', cost: 6.2, tokens: 21e6 },
      { model: 'Haiku 5.5', family: 'haiku', cost: 3.1, tokens: 7.4e6 },
    ],
    projects: [
      { name: 'payments-api', cost: 21.7, calls: 171 },
      { name: 'diyboard', cost: 11.3, calls: 96 },
      { name: 'infra', cost: 5.4, calls: 51 },
    ],
    block: { start: blockStart, end: blockStart + 5 * HOUR, cost: 24.9, tokens: 71e6, calls: 204 },
    activity: { active: true, lastAt: now - 4000, project: 'payments-api', branch: 'feat/idempotency-keys', model: 'Opus 5.5', activeSessions: 2 },
    streakDays: 23,
    streakCapped: false,
    last30Cost: 842.5,
    last30Tokens: 2.31e9,
    plan: {
      plan: 'Max 5x',
      fetchedAt: now,
      stale: false,
      limits: [
        { kind: 'session', label: '5-hour session', percent: 46, resetsAt: blockStart + 5 * HOUR, severity: 'normal' },
        { kind: 'weekly', label: 'Weekly · all models', percent: 63, resetsAt: todayStart + 4 * DAY + 8 * HOUR, severity: 'normal' },
        { kind: 'weekly', label: 'Weekly · Opus', percent: 81, resetsAt: todayStart + 4 * DAY + 8 * HOUR, severity: 'warning' },
      ],
    },
  };
}

const pr = (p: Partial<PullRequest> & Pick<PullRequest, 'title' | 'number' | 'repo'>): PullRequest => ({
  id: `${p.repo}#${p.number}`,
  url: '',
  author: 'you',
  isDraft: false,
  ci: 'SUCCESS',
  review: 'REVIEW_REQUIRED',
  status: 'review',
  closedAt: null,
  additions: 0,
  deletions: 0,
  comments: 0,
  updatedAt: new Date().toISOString(),
  ...p,
});

export function demoGitHub(now: number): GitHubStats {
  const r = rng(42);
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const firstSunday = todayStart - (new Date(todayStart).getDay() + 17 * 7) * DAY;
  const days = Array.from({ length: 18 * 7 }, (_, i) => {
    const t = firstSunday + i * DAY + 12 * HOUR;
    if (t > now) return { date: localKey(t), count: 0 };
    const weekend = [0, 6].includes(new Date(t).getDay());
    const x = r();
    const count = weekend ? (x > 0.7 ? Math.ceil(x * 4) : 0) : x > 0.18 ? Math.ceil(x * x * 16) : 0;
    return { date: localKey(t), count };
  });
  return {
    available: true,
    updatedAt: now,
    login: 'octodev',
    name: 'Ahmed',
    prs: [
      pr({ title: 'Add idempotency keys to charge endpoint', number: 479, repo: 'acme/payments-api', review: 'APPROVED', status: 'approved', additions: 386, deletions: 41 }),
      pr({ title: 'Migrate CI to reusable workflows', number: 133, repo: 'acme/infra', ci: 'FAILURE', additions: 92, deletions: 140 }),
      pr({ title: 'Retry webhook deliveries with exponential backoff', number: 482, repo: 'acme/payments-api', ci: 'PENDING', additions: 214, deletions: 37 }),
      pr({ title: 'Bump eslint to v10 and fix new lint rules', number: 21, repo: 'octodev/diyboard', review: null, additions: 64, deletions: 59 }),
      pr({ title: 'feat: dark mode for the settings page', number: 57, repo: 'octodev/dotfiles-ui', status: 'merged', closedAt: new Date(now - 3 * HOUR).toISOString(), additions: 512, deletions: 88 }),
      pr({ title: 'Spike: gRPC transport for exporter', number: 488, repo: 'acme/payments-api', status: 'closed', closedAt: new Date(now - 9 * HOUR).toISOString(), ci: null, additions: 1204, deletions: 12 }),
    ],
    approvedCount: 1,
    reviewCount: 3,
    closedCount: 2,
    notifications: 4,
    contributions: { totalYear: 1286, today: days.find((d) => d.date === localKey(now))?.count ?? 0, streak: 23, days },
  };
}

export function demoSystem(now: number): SystemStats {
  const cpuHistory = Array.from({ length: 60 }, (_, i) => Math.round(22 + 14 * Math.sin((now / 2000 + i) / 5) + 10 * Math.sin(i * 1.7)));
  return {
    hostname: 'devbox',
    cpu: cpuHistory[cpuHistory.length - 1],
    cpuHistory,
    memUsed: 21.4 * 1024 ** 3,
    memTotal: 32 * 1024 ** 3,
    uptime: 3 * 86400 + 5 * 3600,
    disk: { used: 612 * 1024 ** 3, total: 1000 * 1024 ** 3, mount: 'C:' },
    battery: { level: 84, charging: true },
    tablet: { serial: 'demo', connected: true },
  };
}

export const demoToast: Toast = {
  id: 'demo-toast',
  at: Date.now(),
  kind: 'merged',
  title: 'PR merged',
  detail: 'payments-api#479 Add idempotency keys to charge endpoint',
};
