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
}

export type CiState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;
export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;

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
}

export interface MergedPr {
  id: string;
  title: string;
  number: number;
  repo: string;
  mergedAt: string;
  additions: number;
  deletions: number;
}

export interface GitHubStats {
  available: boolean;
  error?: string;
  updatedAt: number;
  login: string;
  name: string | null;
  openPrs: PullRequest[];
  openCount: number;
  reviewRequests: PullRequest[];
  reviewCount: number;
  merged: MergedPr[]; // last 7 days
  mergedCount: number;
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
