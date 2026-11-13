// Shapes shared by the laptop server and the tablet dashboard.

export interface ClaudeModelSlice {
  model: string; // display label, e.g. "Opus 5.5"
  family: 'opus' | 'fable' | 'sonnet' | 'haiku' | 'other';
  cost: number;
  tokens: number;
}

export interface ClaudeBlock {
  start: number; // epoch ms, floored to the hour
  end: number; // start + 5h
  cost: number;
  tokens: number;
  calls: number;
}

export interface PlanLimit {
  kind: 'session' | 'weekly';
  label: string; // "5-hour session", "Weekly · all models", "Weekly · Fable"
  percent: number; // 0-100
  resetsAt: number | null; // epoch ms; null when no window is open
  severity: 'normal' | 'warning' | 'critical';
}

/** Claude subscription limits, as shown by `/usage` in Claude Code. */
export interface PlanUsage {
  plan: string | null; // "Max 5x", "Pro"
  limits: PlanLimit[];
  fetchedAt: number;
  stale: boolean; // last fetch failed (e.g. token expired); showing the previous reading
}

export interface ClaudeStats {
  available: boolean;
  error?: string;
  updatedAt: number;
  today: {
    cost: number;
    tokens: number; // all tokens incl. cache
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    calls: number; // API calls (assistant messages)
    sessions: number;
  };
  hourlyOutput: number[]; // 24 buckets, output tokens per hour today
  daily: { date: string; cost: number; tokens: number }[]; // last 14 days, oldest first
  models: ClaudeModelSlice[]; // today, by cost desc
  projects: { name: string; cost: number; calls: number }[]; // today, top 4
  block: ClaudeBlock | null; // current 5-hour usage window, if one is open
  activity: {
    active: boolean; // an API call landed in the last 90s
    lastAt: number | null;
    project: string | null;
    branch: string | null;
    model: string | null;
    activeSessions: number; // sessions with activity in last 5 min
  };
  streakDays: number;
  streakCapped: boolean; // streak reaches the edge of the scanned history
  last30Cost: number;
  last30Tokens: number;
  /** Subscription limits; null for API-key users, where the dashboard shows API-equivalent cost instead. */
  plan: PlanUsage | null;
}

export type CiState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;

/** approved/review: open PRs. merged/closed: closed in the last 24 hours. */
export type PrStatus = 'approved' | 'review' | 'merged' | 'closed';

export interface PullRequest {
  id: string;
  title: string;
  number: number;
  repo: string;
  url: string;
  author: string;
  isDraft: boolean;
  ci: CiState;
  review: ReviewState;
  additions: number;
  deletions: number;
  comments: number;
  updatedAt: string;
  status: PrStatus;
  closedAt: string | null;
}

export interface GitHubStats {
  available: boolean;
  error?: string;
  updatedAt: number;
  login: string;
  name: string | null;
  /** PRs authored by `login`: approved, then awaiting review, then closed/merged in the last 24h. */
  prs: PullRequest[];
  approvedCount: number;
  reviewCount: number; // open, non-draft, no decision yet
  closedCount: number; // closed or merged in the last 24h
  notifications: number | null;
  contributions: {
    totalYear: number;
    today: number;
    streak: number;
    days: { date: string; count: number }[]; // last 18 weeks, oldest first, aligned to Sunday
  };
}

export interface SystemStats {
  hostname: string;
  cpu: number; // 0-100
  cpuHistory: number[]; // last 60 samples, oldest first
  memUsed: number; // bytes
  memTotal: number;
  uptime: number; // seconds
  disk: { used: number; total: number; mount: string } | null;
  battery: { level: number; charging: boolean } | null;
  tablet: { serial: string; connected: boolean } | null;
}

export type ToastKind = 'merged' | 'review' | 'ci-fail' | 'ci-pass' | 'tablet' | 'claude' | 'info';

export interface Toast {
  id: string;
  at: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

export interface HelloMessage {
  serverTime: number;
  version: string;
}
