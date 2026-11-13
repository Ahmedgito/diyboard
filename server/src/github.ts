import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHubStats, MergedPr, PullRequest, Toast } from '../../shared/types.ts';

const run = promisify(execFile);

const PR_FIELDS = `
  ... on PullRequest {
    id title number url isDraft updatedAt additions deletions reviewDecision
    author { login }
    repository { nameWithOwner }
    comments { totalCount }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  }`;

const QUERY = `
query($mine: String!, $reviews: String!, $merged: String!) {
  viewer {
    login name
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
  mine: search(query: $mine, type: ISSUE, first: 12) { issueCount nodes { ${PR_FIELDS} } }
  reviews: search(query: $reviews, type: ISSUE, first: 12) { issueCount nodes { ${PR_FIELDS} } }
  merged: search(query: $merged, type: ISSUE, first: 12) {
    issueCount
    nodes { ... on PullRequest { id title number mergedAt additions deletions repository { nameWithOwner } } }
  }
}`;

const HEATMAP_WEEKS = 18;

export class GitHubCollector {
  private token: string | null = null;
  private prev: GitHubStats | null = null;
  onToast: ((t: Omit<Toast, 'id' | 'at'>) => void) | null = null;

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (env) return (this.token = env);
    try {
      const { stdout } = await run('gh', ['auth', 'token'], { windowsHide: true });
      const tok = stdout.trim();
      if (!tok) throw new Error('empty');
      return (this.token = tok);
    } catch {
      throw new Error('No GitHub token. Run `gh auth login` or set GITHUB_TOKEN.');
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
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const [data, notifications] = await Promise.all([
      this.graphql(QUERY, {
        mine: 'is:pr is:open author:@me archived:false sort:updated-desc',
        reviews: 'is:pr is:open review-requested:@me archived:false sort:updated-desc',
        merged: `is:pr author:@me is:merged merged:>=${since} sort:updated-desc`,
      }),
      this.notifications(),
    ]);

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
      openPrs: data.mine.nodes.filter(Boolean).map(mapPr),
      openCount: data.mine.issueCount,
      reviewRequests: data.reviews.nodes.filter(Boolean).map(mapPr),
      reviewCount: data.reviews.issueCount,
      merged: data.merged.nodes.filter(Boolean).map(
        (n: any): MergedPr => ({
          id: n.id,
          title: n.title,
          number: n.number,
          repo: n.repository.nameWithOwner,
          mergedAt: n.mergedAt,
          additions: n.additions,
          deletions: n.deletions,
        }),
      ),
      mergedCount: data.merged.issueCount,
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
    const prevReview = new Set(prev.reviewRequests.map((p) => p.id));
    for (const pr of next.reviewRequests)
      if (!prevReview.has(pr.id)) toast({ kind: 'review', title: `Review requested · ${pr.author}`, detail: `${shortRepo(pr.repo)}#${pr.number} ${pr.title}` });

    const prevMerged = new Set(prev.merged.map((p) => p.id));
    for (const pr of next.merged)
      if (!prevMerged.has(pr.id)) toast({ kind: 'merged', title: 'PR merged', detail: `${shortRepo(pr.repo)}#${pr.number} ${pr.title}` });

    const prevCi = new Map(prev.openPrs.map((p) => [p.id, p.ci]));
    for (const pr of next.openPrs) {
      const before = prevCi.get(pr.id);
      if (before === undefined || before === pr.ci) continue;
      if (pr.ci === 'FAILURE' || pr.ci === 'ERROR')
        toast({ kind: 'ci-fail', title: 'Checks failed', detail: `${shortRepo(pr.repo)}#${pr.number} ${pr.title}` });
      else if (pr.ci === 'SUCCESS')
        toast({ kind: 'ci-pass', title: 'Checks passed', detail: `${shortRepo(pr.repo)}#${pr.number} ${pr.title}` });
    }
  }
}

function mapPr(n: any): PullRequest {
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
  };
}

function shortRepo(repo: string) {
  return repo.split('/')[1] ?? repo;
}

function localDateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
