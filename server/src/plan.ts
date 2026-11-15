import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { PlanLimit, PlanUsage } from '../../shared/types.ts';

/**
 * Reads Claude subscription limits (the numbers behind `/usage` in Claude Code): the 5-hour session
 * and weekly utilization with their reset times.
 *
 * Uses the OAuth token Claude Code keeps in `<claude dir>/.credentials.json`. The file is re-read
 * every poll and never written: Claude Code refreshes the token itself, and refreshing it here
 * would rotate the refresh token out from under it. While the token is expired the last good
 * reading is kept and marked stale.
 */

const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';
// Percentages move slowly and the endpoint rate-limits eagerly (it shares a budget with Claude Code's
// own `/usage`), so poll gently and back off hard on 429.
const POLL_MS = 3 * 60_000;
const BACKOFF_MIN_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

export class PlanCollector {
  private readonly credentialsFile: string;
  private last: PlanUsage | null = null;
  private nextAt = 0;
  private busy = false;
  private backoffMs = 0;
  /** Set once we know there is no subscription login on this machine (API-key users). */
  private unsupported = false;

  constructor(claudeDir: string) {
    this.credentialsFile = join(claudeDir, '.credentials.json');
  }

  get usage(): PlanUsage | null {
    return this.last;
  }

  /** Returns true when the reading changed. Cheap to call often; it only hits the network every few minutes. */
  async poll(now = Date.now()): Promise<boolean> {
    if (this.unsupported || this.busy || now < this.nextAt) return false;
    this.busy = true;
    this.nextAt = now + POLL_MS;
    try {
      const creds = await this.readCredentials();
      if (!creds) {
        this.unsupported = true;
        return false;
      }
      if (creds.expiresAt && creds.expiresAt < now) return this.markStale();

      const res = await fetch(ENDPOINT, {
        headers: {
          authorization: `Bearer ${creds.accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) * 1000;
        this.backoffMs = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, this.backoffMs * 2, retryAfter || 0));
        this.nextAt = now + this.backoffMs;
        console.warn(`[plan] rate limited; next try in ${Math.round(this.backoffMs / 60_000)} min`);
        return this.markStale();
      }
      if (!res.ok) {
        console.warn(`[plan] usage request failed: HTTP ${res.status}`);
        return this.markStale();
      }
      this.backoffMs = 0;
      const limits = parseLimits(await res.json());
      if (!limits.length) return this.markStale();
      const prev = JSON.stringify(this.last?.limits);
      this.last = { plan: planLabel(creds.subscriptionType, creds.rateLimitTier), limits, fetchedAt: now, stale: false };
      return prev !== JSON.stringify(limits);
    } catch (err) {
      console.warn(`[plan] ${(err as Error).message}`);
      return this.markStale();
    } finally {
      this.busy = false;
    }
  }

  private markStale(): boolean {
    if (!this.last || this.last.stale) return false;
    this.last = { ...this.last, stale: true };
    return true;
  }

  private async readCredentials() {
    let raw: string;
    try {
      raw = await fsp.readFile(this.credentialsFile, 'utf8');
    } catch {
      return null; // macOS keeps it in the Keychain; API-key users have none
    }
    const o = JSON.parse(raw)?.claudeAiOauth;
    if (!o?.accessToken) return null;
    return {
      accessToken: String(o.accessToken),
      expiresAt: Number(o.expiresAt) || 0,
      subscriptionType: typeof o.subscriptionType === 'string' ? o.subscriptionType : null,
      rateLimitTier: typeof o.rateLimitTier === 'string' ? o.rateLimitTier : null,
    };
  }
}

function parseLimits(body: any): PlanLimit[] {
  const out: PlanLimit[] = [];
  if (Array.isArray(body?.limits)) {
    for (const l of body.limits) {
      if (typeof l?.percent !== 'number') continue;
      const model = l.scope?.model?.display_name;
      const label =
        l.kind === 'session' ? '5-hour session'
        : l.kind === 'weekly_all' ? 'Weekly · all models'
        : model ? `Weekly · ${model}`
        : String(l.kind ?? 'Limit').replace(/_/g, ' ');
      out.push({
        kind: l.kind === 'session' ? 'session' : 'weekly',
        label,
        percent: l.percent,
        resetsAt: parseTime(l.resets_at),
        severity: l.severity === 'warning' || l.severity === 'critical' ? l.severity : 'normal',
      });
    }
  }
  if (out.length) return out;

  // Older response shape
  const legacy: [string, string, PlanLimit['kind']][] = [
    ['five_hour', '5-hour session', 'session'],
    ['seven_day', 'Weekly · all models', 'weekly'],
    ['seven_day_opus', 'Weekly · Opus', 'weekly'],
    ['seven_day_sonnet', 'Weekly · Sonnet', 'weekly'],
  ];
  for (const [key, label, kind] of legacy) {
    const w = body?.[key];
    if (typeof w?.utilization !== 'number') continue;
    out.push({ kind, label, percent: w.utilization, resetsAt: parseTime(w.resets_at), severity: severityOf(w.utilization) });
  }
  return out;
}

function parseTime(s: unknown): number | null {
  const t = typeof s === 'string' ? Date.parse(s) : NaN;
  // The API jitters around the boundary (07:59:59.55 vs 08:00:00.36); snap so it reads "1:00 PM", not "12:59".
  return Number.isFinite(t) ? Math.round(t / 60_000) * 60_000 : null;
}

function severityOf(pct: number): PlanLimit['severity'] {
  return pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : 'normal';
}

/** ("max", "default_claude_max_5x") -> "Max 5x" */
function planLabel(type: string | null, tier: string | null): string | null {
  const mult = tier?.match(/_(\d+x)$/)?.[1];
  if (!type) return null;
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  return mult ? `${name} ${mult}` : name;
}
