import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHubStats, PrStatus, PullRequest, Toast } from '../../shared/types.ts';

const run = promisify(execFile);

const PR_FIELDS = `
  ... on PullRequest {
    id title number url isDraft updatedAt additions deletions reviewDecision state closedAt merged
    author { login }
    repository { nameWithOwner }
    comments { totalCount }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  }`;

const QUERY = `
query($open: String!, $closed: String!) {
  viewer {
    login name
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
  open: search(query: $open, type: ISSUE, first: 50) { nodes { ${PR_FIELDS} } }
  closed: search(query: $closed, type: ISSUE, first: 30) { nodes { ${PR_FIELDS} } }
}`;

const CLOSED_WINDOW_MS = 24 * 3_600_000;
const ORDER: Record<PrStatus, number> = { approved: 0, review: 1, merged: 2, closed: 2 };

const HEATMAP_WEEKS = 18;

export class GitHubCollector {
  private readonly user: string | null;
  private token: string | null = null;
  private prev: GitHubStats | null = null;
  onToast: ((t: Omit<Toast, 'id' | 'at'>) => void) | null = null;

  constructor(user: string | null = null) {
    this.user = user;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (env) return (this.token = env);
    // `--user` reads that account's token without switching the active `gh` account.
    const args = this.user ? ['auth', 'token', '--user', this.user] : ['auth', 'token'];
    try {
      const { stdout } = await run('gh', args, { windowsHide: true });
      const tok = stdout.trim();
      if (!tok) throw new Error('empty');
      return (this.token = tok);
    } catch {
      throw new Error(
        this.user
          ? `No GitHub token for ${this.user}. Run \`gh auth login\` with that account.`
          : 'No GitHub token. Run `gh auth login` or set GITHUB_TOKEN.',
      );
    }
  }

  private async graphql(query: string, variables: Record<string, unknown>) {
    const token = await this.getToken();
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'diyboard' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 401) {
      this.token = null;
      throw new Error('GitHub token rejected (401)');
    }
    const json = (await res.json()) as { data?: any; errors?: { message: string }[] };
    if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
    return json.data;
  }

  private async notifications(): Promise<number | null> {
    try {
      const token = await this.getToken();
      const res = await fetch('https://api.github.com/notifications?per_page=50', {
        headers: { authorization: `bearer ${token}`, 'user-agent': 'diyboard', accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      return ((await res.json()) as unknown[]).length;
    } catch {
      return null;
    }
  }

  async poll(): Promise<GitHubStats> {
    const now = Date.now();
    const since = new Date(now - CLOSED_WINDOW_MS).toISOString().replace(/\.\d+Z$/, 'Z');
    const [data, notifications] = await Promise.all([
      this.graphql(QUERY, {
        // `@me` is whichever account the token belongs to (see `githubUser` in the config)
        open: 'is:pr is:open author:@me archived:false sort:updated-desc',
        closed: `is:pr is:closed author:@me closed:>=${since} sort:updated-desc`,
      }),
      this.notifications(),
    ]);

    // Drafts and "changes requested" are left out on purpose: the panel tracks approved / in review / closed.
    const prs = [...data.open.nodes, ...data.closed.nodes]
      .filter(Boolean)
      .map(mapPr)
      .filter((p): p is PullRequest => !!p && (!p.closedAt || now - Date.parse(p.closedAt) <= CLOSED_WINDOW_MS))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || Date.parse(b.closedAt ?? b.updatedAt) - Date.parse(a.closedAt ?? a.updatedAt));
    const count = (...s: PrStatus[]) => prs.filter((p) => s.includes(p.status)).length;

    const cal = data.viewer.contributionsCollection.contributionCalendar;
    const allDays: { date: string; count: number }[] = cal.weeks.flatMap((w: any) =>
      w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })),
    );
    const todayKey = localDateKey(Date.now());
    const upToToday = allDays.filter((d) => d.date <= todayKey);
    // keep whole weeks so the heatmap columns line up on Sunday
    const weeks = cal.weeks.slice(-HEATMAP_WEEKS);
    const days = weeks.flatMap((w: any) => w.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount })));

    let streak = 0;
    let i = upToToday.length - 1;
    if (i >= 0 && upToToday[i].count === 0) i--; // today not done yet: count from yesterday
    for (; i >= 0 && upToToday[i].count > 0; i--) streak++;

    const stats: GitHubStats = {
      available: true,
      updatedAt: Date.now(),
      login: data.viewer.login,
      name: data.viewer.name,
      prs,
      approvedCount: count('approved'),
      reviewCount: count('review'),
      closedCount: count('merged', 'closed'),
      notifications,
      contributions: {
        totalYear: cal.totalContributions,
        today: upToToday.at(-1)?.date === todayKey ? upToToday.at(-1)!.count : 0,
        streak,
        days,
      },
    };
    this.diff(stats);
    this.prev = stats;
    return stats;
  }

  /** Emit toasts for things that changed since the last poll. */
  private diff(next: GitHubStats) {
    const prev = this.prev;
    if (!prev || !this.onToast) return;
    const toast = this.onToast;
    const before = new Map(prev.prs.map((p) => [p.id, p]));
    for (const pr of next.prs) {
      const was = before.get(pr.id);
      const detail = `${shortRepo(pr.repo)}#${pr.number} ${pr.title}`;
      if (pr.status !== was?.status) {
        if (pr.status === 'merged') toast({ kind: 'merged', title: 'PR merged', detail });
        else if (pr.status === 'closed') toast({ kind: 'info', title: 'PR closed', detail });
        else if (pr.status === 'approved' && was) toast({ kind: 'review', title: 'PR approved', detail });
      }
      if (pr.closedAt || !was || was.ci === pr.ci) continue;
      if (pr.ci === 'FAILURE' || pr.ci === 'ERROR') toast({ kind: 'ci-fail', title: 'Checks failed', detail });
      else if (pr.ci === 'SUCCESS') toast({ kind: 'ci-pass', title: 'Checks passed', detail });
    }
  }
}

/** Returns null for PRs outside the tracked states (drafts, changes requested). */
function mapPr(n: any): PullRequest | null {
  const status: PrStatus | null =
    n.state === 'MERGED' || n.merged ? 'merged'
    : n.state === 'CLOSED' ? 'closed'
    : n.isDraft ? null
    : n.reviewDecision === 'APPROVED' ? 'approved'
    : n.reviewDecision === 'CHANGES_REQUESTED' ? null
    : 'review'; // REVIEW_REQUIRED, or no review rule on the repo
  if (!status) return null;
  return {
    id: n.id,
    title: n.title,
    number: n.number,
    url: n.url,
    repo: n.repository.nameWithOwner,
    author: n.author?.login ?? 'ghost',
    isDraft: n.isDraft,
    ci: n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
    review: n.reviewDecision ?? null,
    additions: n.additions,
    deletions: n.deletions,
    comments: n.comments.totalCount,
    updatedAt: n.updatedAt,
    status,
    closedAt: status === 'merged' || status === 'closed' ? (n.closedAt ?? null) : null,
  };
}

function shortRepo(repo: string) {
  return repo.split('/')[1] ?? repo;
}

function localDateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
