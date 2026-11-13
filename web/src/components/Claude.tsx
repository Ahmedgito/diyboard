import type { ClaudeStats, PlanLimit } from '../../../shared/types.ts';
import { fmtAgo, fmtDuration, fmtInt, fmtPct, fmtReset, fmtTokens, fmtUsd } from '../format.ts';
import { IconFlame, IconSpark } from './icons.tsx';
import { AnimatedNumber, Bars, Card, CardHeader } from './ui.tsx';

const FAMILY_COLOR: Record<string, string> = {
  opus: 'var(--series-1)',
  fable: 'var(--series-2)',
  sonnet: 'var(--series-3)',
  haiku: 'var(--series-4)',
  other: 'var(--text-muted)',
};

export function ClaudePanel({ stats, now }: { stats: ClaudeStats | null; now: number }) {
  if (!stats || !stats.available) {
    return (
      <Card className="claude-card" delay={60}>
        <CardHeader icon={<IconSpark />} title="Claude Code" />
        <div className="empty">
          <div className="loader" />
          <span>{stats?.error ?? 'Waiting for laptop…'}</span>
        </div>
      </Card>
    );
  }

  const { today, activity, block } = stats;
  const hour = new Date(now).getHours();
  const totalModelCost = stats.models.reduce((s, m) => s + m.cost, 0) || 1;
  const blockPct = block ? Math.min(1, (now - block.start) / (block.end - block.start)) : 0;
  const peak = Math.max(...stats.hourlyOutput);
  const maxProject = stats.projects[0]?.cost || 1;
  const totalProjectCost = stats.projects.reduce((s, p) => s + p.cost, 0) || 1;
  // Subscription users see plan limits; API-key users see API-equivalent cost.
  const plan = stats.plan?.limits.length ? stats.plan : null;
  const session = plan?.limits.find((l) => l.kind === 'session') ?? null;
  const sessionOpen = !!session?.resetsAt && session.resetsAt > now;
  // The hero is the session; the bars below are the weekly limits (two fit on the 600px stage).
  const weekly = plan?.limits.filter((l) => l !== session).slice(0, 2) ?? [];

  return (
    <Card className="claude-card" delay={60}>
      <CardHeader
        icon={<IconSpark style={{ transform: `rotate(${((now / 1000) * 6) % 360}deg)` }} />}
        title="Claude Code"
        right={
          activity.active ? (
            <span className="pill pill-live">
              <span className={`live-dot ${Math.floor(now / 1000) % 2 ? 'beat-off' : ''}`} />
              working
            </span>
          ) : (
            <span className="pill">idle{activity.lastAt ? ` · ${fmtAgo(activity.lastAt, now)}` : ''}</span>
          )
        }
      />

      <div className="claude-hero">
        {plan ? (
          <div title={plan.plan ? `Claude ${plan.plan}` : undefined}>
            <div className="hero-value">
              <AnimatedNumber value={session ? livePercent(session, now) : 0} format={fmtPct} />
            </div>
            <div className="hero-caption">
              of 5h limit{sessionOpen ? ` · resets ${fmtReset(session!.resetsAt!, now)}` : ''}
              {plan.stale && <span className="stale"> · stale</span>}
            </div>
          </div>
        ) : (
          <div>
            <div className="hero-value">
              <AnimatedNumber value={today.cost} format={fmtUsd} />
            </div>
            <div className="hero-caption">API-equivalent spend today</div>
          </div>
        )}
        <div className="hero-side">
          <div>
            <span className="tnum strong">
              <AnimatedNumber value={today.tokens} format={fmtTokens} />
            </span>{' '}
            <span className="muted">tokens</span>
          </div>
          <div>
            <span className="tnum strong">
              <AnimatedNumber value={today.calls} format={fmtInt} />
            </span>{' '}
            <span className="muted">calls · </span>
            <span className="tnum strong">{today.sessions}</span> <span className="muted">sessions</span>
          </div>
        </div>
      </div>

      <div className={`now-line ${activity.active ? 'is-active' : ''}`}>
        {activity.project ? (
          <>
            <span className="muted">{activity.active ? 'In' : 'Last in'}</span>
            <span className="mono now-project">{activity.project}</span>
            {activity.branch && <span className="mono muted now-branch">⎇ {activity.branch}</span>}
            <span className="now-model">{activity.model}</span>
          </>
        ) : (
          <span className="muted">No sessions yet today</span>
        )}
      </div>

      {plan ? (
        <div className="limits">
          {weekly.map((l) => (
            <LimitRow key={l.label} limit={l} now={now} />
          ))}
        </div>
      ) : (
        <div className="block">
          <div className="row-between small">
            <span className="muted">5-hour window</span>
            {block ? (
              <span className="tnum">
                {fmtUsd(block.cost)} <span className="muted">· resets in</span> {fmtDuration(block.end - now)}
              </span>
            ) : (
              <span className="muted">no open window</span>
            )}
          </div>
          <div className="block-track">
            <div className="block-fill" style={{ transform: `scaleX(${blockPct})` }} />
            <div className="block-glow" style={{ left: `${blockPct * 100}%` }} />
          </div>
        </div>
      )}

      <div className="chart-block">
        <div className="row-between small">
          <span className="muted">Output tokens by hour</span>
          <span className="muted tnum">peak {fmtTokens(peak)}/h</span>
        </div>
        <Bars values={stats.hourlyOutput} highlight={hour} height={plan ? 48 : 62} />
        <div className="axis small muted">
          <span>12a</span>
          <span>6a</span>
          <span>12p</span>
          <span>6p</span>
          <span>11p</span>
        </div>
      </div>

      <div className="models">
        <div className="model-bar">
          {stats.models.map((m) => (
            <div key={m.model} style={{ flexGrow: m.cost / totalModelCost, background: FAMILY_COLOR[m.family] }} />
          ))}
        </div>
        <div className="model-legend small">
          {stats.models.slice(0, 4).map((m) => (
            <span key={m.model}>
              <i style={{ background: FAMILY_COLOR[m.family] }} />
              {m.model} <span className="muted tnum">{Math.round((m.cost / totalModelCost) * 100)}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className="chart-block">
        <div className="row-between small">
          <span className="muted">{plan ? 'Daily tokens' : 'Daily spend'} · 14 days</span>
          <span className="tnum">
            <span className="muted">30d</span> {plan ? fmtTokens(stats.last30Tokens) : fmtUsd(stats.last30Cost)}
          </span>
        </div>
        <Bars
          values={stats.daily.map((d) => (plan ? d.tokens : d.cost))}
          highlight={stats.daily.length - 1}
          height={plan ? 40 : 48}
          gap={4}
        />
      </div>

      <div className="token-mix">
        {[
          ['output', today.outputTokens],
          ['cache read', today.cacheReadTokens],
          ['cache write', today.cacheWriteTokens],
          ['input', today.inputTokens],
        ].map(([label, n]) => (
          <div key={label as string}>
            <span className="tnum strong">{fmtTokens(n as number)}</span>
            <span className="muted">{label}</span>
          </div>
        ))}
      </div>

      <div className="claude-foot">
        <div className="projects">
          {stats.projects.slice(0, 3).map((p) => (
            <div key={p.name} className="project-row small">
              <span className="mono project-name">{p.name}</span>
              <span className="project-bar">
                <span style={{ transform: `scaleX(${p.cost / maxProject})` }} />
              </span>
              <span className="tnum">{plan ? fmtPct((p.cost / totalProjectCost) * 100) : fmtUsd(p.cost)}</span>
            </div>
          ))}
        </div>
        <div className="streak" title="Days in a row with Claude Code usage">
          <IconFlame className="flame" />
          <span className="streak-num tnum">
            {stats.streakDays}
            {stats.streakCapped ? '+' : ''}
          </span>
          <span className="small muted">day streak</span>
        </div>
      </div>
    </Card>
  );
}

/** A window whose reset time has passed is empty until the next reading arrives. */
function livePercent(l: PlanLimit, now: number) {
  return l.resetsAt !== null && l.resetsAt <= now ? 0 : Math.min(100, Math.max(0, l.percent));
}

function LimitRow({ limit, now }: { limit: PlanLimit; now: number }) {
  const pct = livePercent(limit, now);
  const open = limit.resetsAt !== null && limit.resetsAt > now;
  return (
    <div className="limit">
      <div className="row-between small">
        <span className="muted">{limit.label}</span>
        <span className="tnum">
          {fmtPct(pct)}
          {open && (
            <>
              {' '}
              <span className="muted">· resets</span> {fmtReset(limit.resetsAt!, now)}
            </>
          )}
        </span>
      </div>
      <div className="limit-track">
        <div className={`limit-fill sev-${pct > 0 ? limit.severity : 'normal'}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
