// API list prices in USD per million tokens (Anthropic first-party, cached 2026-11-03).
// Used to show an "API-equivalent" cost; subscription users are not billed this.
// cacheRead defaults to 0.1x input; cache writes are 1.25x input (5m TTL) and 2x input (1h TTL).

interface Price {
  input: number;
  output: number;
  cacheRead?: number;
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-mythos-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-mythos-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

const ALIASES: Record<string, string> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  fable: 'claude-fable-5-2',
  haiku: 'claude-haiku-5-5',
};

const FAMILY_FALLBACK: Record<string, Price> = {
  opus: PRICES['claude-opus-5-5'],
  fable: PRICES['claude-fable-5-2'],
  mythos: PRICES['claude-fable-5-2'],
  sonnet: PRICES['claude-sonnet-5-5'],
  haiku: PRICES['claude-haiku-5-5'],
};

export function canonicalModel(model: string): string {
  const m = model.toLowerCase().replace(/\[.*\]$/, '');
  if (ALIASES[m]) return ALIASES[m];
  // strip date suffixes like -20250929
  return m.replace(/-\d{8}$/, '');
}

function priceFor(model: string): Price | null {
  const id = canonicalModel(model);
  if (PRICES[id]) return PRICES[id];
  for (const fam of Object.keys(FAMILY_FALLBACK)) if (id.includes(fam)) return FAMILY_FALLBACK[fam];
  return null;
}

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export function costOf(model: string, u: Usage): number {
  const p = priceFor(model);
  if (!p) return 0;
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheRead * cacheRead +
      u.cacheWrite5m * p.input * 1.25 +
      u.cacheWrite1h * p.input * 2) /
    1_000_000
  );
}

export type Family = 'opus' | 'fable' | 'sonnet' | 'haiku' | 'other';

export function modelFamily(model: string): Family {
  const id = canonicalModel(model);
  if (id.includes('opus')) return 'opus';
  if (id.includes('fable') || id.includes('mythos')) return 'fable';
  if (id.includes('sonnet')) return 'sonnet';
  if (id.includes('haiku')) return 'haiku';
  return 'other';
}

/** "claude-opus-5-5" -> "Opus 5.5" */
export function modelLabel(model: string): string {
  const id = canonicalModel(model);
  const match = id.match(/^claude-([a-z]+)-(\d+(?:-\d+)?)$/);
  if (!match) return id;
  const name = match[1][0].toUpperCase() + match[1].slice(1);
  return `${name} ${match[2].replace('-', '.')}`;
}
