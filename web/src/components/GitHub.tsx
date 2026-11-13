import type { CiState, GitHubStats, PullRequest } from '../../../shared/types.ts';
import { fmtAgo, shortRepo } from '../format.ts';
import { IconBell, IconCheck, IconDash, IconDot, IconEye, IconGitHub, IconMerge, IconX } from './icons.tsx';
import { AnimatedNumber, Card, CardHeader } from './ui.tsx';

function CiIcon({ ci }: { ci: CiState }) {
  if (ci === 'SUCCESS') return <IconCheck className="ci ci-good" aria-label="checks passed" />;
  if (ci === 'FAILURE' || ci === 'ERROR') return <IconX className="ci ci-bad" aria-label="checks failed" />;
  if (ci === 'PENDING' || ci === 'EXPECTED') return <IconDot className="ci ci-pending" aria-label="checks running" />;
  return <IconDash className="ci ci-none" aria-label="no checks" />;
}

function StatusIcon({ pr }: { pr: PullRequest }) {
  if (pr.status === 'merged') return <IconMerge className="ci ci-merged" aria-label="merged" />;
  if (pr.status === 'closed') return <IconX className="ci ci-none" aria-label="closed" />;
  return <CiIcon ci={pr.ci} />;
}

const BADGE: Record<PullRequest['status'], [string, string]> = {
  approved: ['Approved', 'badge-good'],
  review: ['Review', 'badge-warn'],
  merged: ['Merged', 'badge-merged'],
  closed: ['Closed', ''],
};

const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];

function heatLevel(count: number, max: number) {
  if (count <= 0) return 0;
  const r = count / Math.max(max, 1);
  if (r > 0.66) return 4;
  if (r > 0.33) return 3;
  if (r > 0.12) return 2;
  return 1;
}

export function GitHubPanel({ stats }: { stats: GitHubStats | null }) {
  if (!stats || !stats.available) {
    return (
      <Card className="gh-card" delay={180}>
        <CardHeader icon={<IconGitHub />} title="GitHub" />
        <div className="empty">
          <div className="loader" />
          <span>{stats?.error ?? 'Fetching pull requests…'}</span>
        </div>
      </Card>
    );
  }

  const d0 = new Date();
  const todayKey = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  const max = Math.max(...stats.contributions.days.map((d) => d.count));
  const list = stats.prs.slice(0, 6); // server orders them approved → review → closed
  const now = Date.now();

  return (
    <Card className="gh-card" delay={180}>
      <CardHeader
        icon={<IconGitHub />}
        title={<span className="mono">@{stats.login}</span>}
        right={
          stats.notifications ? (
            <span className="pill pill-accent">
              <IconBell width={12} height={12} /> {stats.notifications}
            </span>
          ) : stats.error ? (
            <span className="pill pill-bad" title={stats.error}>
              stale
            </span>
          ) : null
        }
      />

      <div className="gh-tiles">
        <div className={`tile ${stats.approvedCount ? 'tile-good' : ''}`}>
          <IconCheck className="tile-icon" />
          <span className="tile-num">
            <AnimatedNumber value={stats.approvedCount} format={(n) => String(Math.round(n))} />
          </span>
          <span className="tile-label">approved</span>
        </div>
        <div className={`tile ${stats.reviewCount ? 'tile-hot' : ''}`}>
          <IconEye className="tile-icon" />
          <span className="tile-num">
            <AnimatedNumber value={stats.reviewCount} format={(n) => String(Math.round(n))} />
          </span>
          <span className="tile-label">in review</span>
        </div>
        <div className="tile">
          <IconMerge className="tile-icon" />
          <span className="tile-num">
            <AnimatedNumber value={stats.closedCount} format={(n) => String(Math.round(n))} />
          </span>
          <span className="tile-label">closed 24h</span>
        </div>
      </div>

      <div className="pr-list">
        {list.length === 0 && <div className="muted small pr-empty">No PRs approved, in review or closed today</div>}
        {list.map((pr, i) => (
          <div key={pr.id} className={`pr-row ${pr.closedAt ? 'pr-done' : ''}`} style={{ animationDelay: `${400 + i * 70}ms` }}>
            <StatusIcon pr={pr} />
            <div className="pr-main">
              <div className="pr-title">{pr.title}</div>
              <div className="pr-meta small">
                <span className="mono">
                  {shortRepo(pr.repo)}#{pr.number}
                </span>
                {pr.closedAt ? (
                  <span className="muted">{fmtAgo(Date.parse(pr.closedAt), now)}</span>
                ) : (
                  <span className="diff">
                    <span className="add">+{pr.additions}</span> <span className="del">−{pr.deletions}</span>
                  </span>
                )}
              </div>
            </div>
            <span className={`badge ${BADGE[pr.status][1]}`}>{BADGE[pr.status][0]}</span>
          </div>
        ))}
      </div>

      <div className="heat-block">
        <div className="heatmap">
          {stats.contributions.days.map((d, i) => (
            <span
              key={d.date}
              className={`heat-cell ${d.date === todayKey ? 'heat-today' : ''}`}
              style={{ background: HEAT[heatLevel(d.count, max)], animationDelay: `${600 + Math.floor(i / 7) * 30}ms` }}
              title={`${d.date}: ${d.count}`}
            />
          ))}
        </div>
        <div className="heat-foot small">
          <span>
            <span className="tnum strong">{stats.contributions.totalYear}</span> <span className="muted">in 1y</span>
          </span>
          <span>
            <span className="tnum strong">{stats.contributions.today}</span> <span className="muted">today</span>
          </span>
          <span>
            <span className="tnum strong">{stats.contributions.streak}d</span> <span className="muted">streak</span>
          </span>
          <span className="heat-legend muted">
            0
            {HEAT.map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
            {max}
          </span>
        </div>
      </div>
    </Card>
  );
}
