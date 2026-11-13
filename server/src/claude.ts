import { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import type { ClaudeBlock, ClaudeModelSlice, ClaudeStats } from '../../shared/types.ts';
import { costOf, modelFamily, modelLabel } from './pricing.ts';

/**
 * Reads Claude Code transcripts (~/.claude/projects/**\/*.jsonl) incrementally.
 * Each file is tracked by byte offset so after the first scan only appended bytes are read.
 */

interface UsageEvent {
  t: number;
  model: string;
  tokens: number;
  output: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  session: string;
  project: string;
  branch: string | null;
}

interface FileCursor {
  offset: number;
}

const HISTORY_DAYS = 32;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const BLOCK_MS = 5 * HOUR;
const CHUNK = 8 * 1024 * 1024;
const NL = 0x0a;

export class ClaudeCollector {
  private readonly dir: string;
  private readonly cursors = new Map<string, FileCursor>();
  private readonly seen = new Set<string>();
  private readonly sessionProject = new Map<string, string>();
  private events: UsageEvent[] = [];
  private sorted = true;
  private knownSessionsToday = new Set<string>();
  private initialScanDone = false;
  /** Called when a new session starts today (after the initial scan). */
  onNewSession: ((project: string) => void) | null = null;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Returns true when new usage events were ingested. */
  async scan(): Promise<boolean> {
    const cutoff = Date.now() - HISTORY_DAYS * DAY;
    let entries: string[];
    try {
      entries = (await fsp.readdir(this.dir, { recursive: true })) as string[];
    } catch {
      throw new Error(`Claude projects folder not found: ${this.dir}`);
    }
    let added = 0;
    for (const rel of entries) {
      if (!rel.endsWith('.jsonl')) continue;
      const path = join(this.dir, rel);
      let st;
      try {
        st = await fsp.stat(path);
      } catch {
        continue;
      }
      if (st.mtimeMs < cutoff) continue;
      let cursor = this.cursors.get(path);
      if (!cursor) {
        cursor = { offset: 0 };
        this.cursors.set(path, cursor);
      }
      if (st.size < cursor.offset) cursor.offset = 0; // file was rewritten
      if (st.size === cursor.offset) continue;
      added += await this.readFrom(path, cursor, st.size, cutoff, projectFromPath(rel));
    }
    if (added > 0) this.sorted = false;
    this.prune(cutoff);
    this.initialScanDone = true;
    return added > 0;
  }

  private async readFrom(path: string, cursor: FileCursor, size: number, cutoff: number, fallbackProject: string) {
    const fh = await fsp.open(path, 'r');
    let added = 0;
    try {
      let pos = cursor.offset;
      let carry: Buffer = Buffer.alloc(0);
      while (pos < size) {
        const len = Math.min(CHUNK, size - pos);
        const buf = Buffer.allocUnsafe(len);
        const { bytesRead } = await fh.read(buf, 0, len, pos);
        if (bytesRead <= 0) break;
        pos += bytesRead;
        const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
        const lastNl = data.lastIndexOf(NL);
        if (lastNl === -1) {
          carry = Buffer.from(data);
          continue;
        }
        const text = data.toString('utf8', 0, lastNl);
        carry = Buffer.from(data.subarray(lastNl + 1));
        for (const line of text.split('\n')) added += this.ingest(line, cutoff, fallbackProject);
        cursor.offset = pos - carry.length;
      }
    } finally {
      await fh.close();
    }
    return added;
  }

  private ingest(line: string, cutoff: number, fallbackProject: string): number {
    if (line.length < 64 || !line.includes('"usage"') || !line.includes('"assistant"')) return 0;
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      return 0;
    }
    if (o.type !== 'assistant') return 0;
    const m = o.message;
    const u = m?.usage;
    if (!u || !m.model || m.model === '<synthetic>') return 0;
    // Claude Code writes one line per content block, all carrying the same usage. Count once.
    const key = `${m.id ?? ''}:${o.requestId ?? ''}`;
    if (key !== ':') {
      if (this.seen.has(key)) return 0;
      this.seen.add(key);
    }
    const t = Date.parse(o.timestamp);
    if (!(t >= cutoff)) return 0;

    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const cw1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const cost = costOf(m.model, {
      input,
      output,
      cacheRead,
      cacheWrite1h: cw1h,
      cacheWrite5m: Math.max(0, cacheWrite - cw1h),
    });
    const session = String(o.sessionId ?? '');
    // `cwd` follows the shell (`cd android/...`), so name the project after where the session started.
    let project = session ? this.sessionProject.get(session) : undefined;
    if (!project) {
      const cwd: string | undefined = o.cwd;
      project = cwd ? basename(cwd.replace(/[\\/]+$/, '')) : fallbackProject;
      if (session) this.sessionProject.set(session, project);
    }
    this.events.push({
      t,
      model: m.model,
      input,
      output,
      cacheRead,
      cacheWrite,
      tokens: input + output + cacheRead + cacheWrite,
      cost,
      session,
      project,
      branch: o.gitBranch && o.gitBranch !== 'HEAD' ? o.gitBranch : null,
    });

    if (this.initialScanDone && t >= startOfDay(Date.now()) && session && !this.knownSessionsToday.has(session)) {
      this.knownSessionsToday.add(session);
      this.onNewSession?.(project);
    }
    return 1;
  }

  private prune(cutoff: number) {
    if (this.events.length && this.events[0].t < cutoff && this.sorted) {
      this.events = this.events.filter((e) => e.t >= cutoff);
    }
  }

  snapshot(now = Date.now()): ClaudeStats {
    if (!this.sorted) {
      this.events.sort((a, b) => a.t - b.t);
      this.sorted = true;
    }
    const todayStart = startOfDay(now);
    const today = {
      cost: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      calls: 0,
      sessions: 0,
    };
    const hourlyOutput = new Array<number>(24).fill(0);
    const sessionsToday = new Set<string>();
    const models = new Map<string, ClaudeModelSlice>();
    const projects = new Map<string, { name: string; cost: number; calls: number }>();
    const dailyMap = new Map<string, { cost: number; tokens: number }>();
    const activeDays = new Set<string>();
    const recentSessions = new Set<string>();
    let last30Cost = 0;
    let last30Tokens = 0;

    // 5-hour usage blocks (same idea as the Claude subscription windows)
    let block: ClaudeBlock | null = null;
    let lastT = -Infinity;

    for (const e of this.events) {
      if (e.t > now + 60_000) continue;
      const dayKey = localDateKey(e.t);
      activeDays.add(dayKey);
      const d = dailyMap.get(dayKey) ?? { cost: 0, tokens: 0 };
      d.cost += e.cost;
      d.tokens += e.tokens;
      dailyMap.set(dayKey, d);
      if (e.t >= now - 30 * DAY) {
        last30Cost += e.cost;
        last30Tokens += e.tokens;
      }

      if (!block || e.t >= block.end || e.t - lastT >= BLOCK_MS) {
        const start = Math.floor(e.t / HOUR) * HOUR;
        block = { start, end: start + BLOCK_MS, cost: 0, tokens: 0, calls: 0 };
      }
      block.cost += e.cost;
      block.tokens += e.tokens;
      block.calls += 1;
      lastT = e.t;

      if (e.t >= now - 5 * 60_000 && e.session) recentSessions.add(e.session);

      if (e.t < todayStart) continue;
      today.cost += e.cost;
      today.tokens += e.tokens;
      today.inputTokens += e.input;
      today.outputTokens += e.output;
      today.cacheReadTokens += e.cacheRead;
      today.cacheWriteTokens += e.cacheWrite;
      today.calls += 1;
      if (e.session) sessionsToday.add(e.session);
      hourlyOutput[new Date(e.t).getHours()] += e.output;

      const label = modelLabel(e.model);
      const slice = models.get(label) ?? { model: label, family: modelFamily(e.model), cost: 0, tokens: 0 };
      slice.cost += e.cost;
      slice.tokens += e.tokens;
      models.set(label, slice);

      const p = projects.get(e.project) ?? { name: e.project, cost: 0, calls: 0 };
      p.cost += e.cost;
      p.calls += 1;
      projects.set(e.project, p);
    }
    today.sessions = sessionsToday.size;
    for (const s of sessionsToday) this.knownSessionsToday.add(s);

    const daily: ClaudeStats['daily'] = [];
    for (let i = 13; i >= 0; i--) {
      const key = localDateKey(todayStart - i * DAY + 12 * HOUR);
      const d = dailyMap.get(key);
      daily.push({ date: key, cost: d?.cost ?? 0, tokens: d?.tokens ?? 0 });
    }

    // streak: consecutive days with usage, ending today (or yesterday if today is still empty)
    let streak = 0;
    let cursor = todayStart + 12 * HOUR;
    if (!activeDays.has(localDateKey(cursor))) cursor -= DAY;
    while (activeDays.has(localDateKey(cursor))) {
      streak++;
      cursor -= DAY;
    }

    const last = this.events.length ? this.events[this.events.length - 1] : null;
    return {
      available: true,
      updatedAt: now,
      today,
      hourlyOutput,
      daily,
      models: [...models.values()].sort((a, b) => b.cost - a.cost),
      projects: [...projects.values()].sort((a, b) => b.cost - a.cost).slice(0, 4),
      block: block && now < block.end ? block : null,
      activity: {
        active: !!last && now - last.t < 90_000,
        lastAt: last?.t ?? null,
        project: last?.project ?? null,
        branch: last?.branch ?? null,
        model: last ? modelLabel(last.model) : null,
        activeSessions: recentSessions.size,
      },
      streakDays: streak,
      streakCapped: streak >= HISTORY_DAYS - 1,
      last30Cost,
      last30Tokens,
      plan: null,
    };
  }
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localDateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "c--Users-me-diyboard/abc.jsonl" -> "diyboard" (best effort, cwd is preferred) */
function projectFromPath(rel: string): string {
  const folder = rel.split(/[\\/]/)[0] ?? '';
  const parts = folder.split('-').filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}
