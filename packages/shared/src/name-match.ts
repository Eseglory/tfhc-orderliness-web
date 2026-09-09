/**
 * Fuzzy person-name matching for spreadsheet imports.
 *
 * Church spreadsheets list people inconsistently: "UCHENNA CHINENYE" vs
 * "Chinenye Uchenna", maiden vs married surnames, extra middle names, casing and
 * punctuation noise. We match on the **set of name tokens**, order-independent,
 * with a small tolerance for one side having extra tokens (a middle name) and
 * for near-identical tokens (one typo / prefix).
 */

const STOP_TOKENS = new Set(['mr', 'mrs', 'miss', 'dr', 'pastor', 'bro', 'sis', 'brother', 'sister', 'the', 'and']);

export function normalizeNameTokens(raw: string): string[] {
  return (raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/['-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
}

function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) <= 1 && levenshtein(a, b) <= 1) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

export interface NameMatchScore {
  /** 0..1 — share of the smaller token set that has a partner in the other. */
  score: number;
  /** Number of tokens matched. */
  matched: number;
  /** Tokens in the query with no partner. */
  unmatchedQuery: string[];
}

export function scoreNameMatch(query: string, candidate: string): NameMatchScore {
  const q = normalizeNameTokens(query);
  const c = normalizeNameTokens(candidate);
  if (q.length === 0 || c.length === 0) return { score: 0, matched: 0, unmatchedQuery: q };

  const usedC = new Set<number>();
  const unmatchedQuery: string[] = [];
  let matched = 0;
  for (const qt of q) {
    let hit = -1;
    for (let i = 0; i < c.length; i++) {
      if (usedC.has(i)) continue;
      if (tokenSimilar(qt, c[i])) {
        hit = i;
        break;
      }
    }
    if (hit >= 0) {
      usedC.add(hit);
      matched++;
    } else {
      unmatchedQuery.push(qt);
    }
  }
  const denom = Math.min(q.length, c.length);
  return { score: matched / denom, matched, unmatchedQuery };
}

export interface NameMatchResult<T> {
  match: T | null;
  score: number;
  /** True when a second candidate scored within 0.15 of the best — needs review. */
  ambiguous: boolean;
  runnerUp: { item: T; score: number } | null;
}

/**
 * Pick the best candidate for `query` from `candidates` (each described by one or
 * more name strings). Requires `minScore` (default 0.67) and at least two matched
 * tokens, unless the query itself has a single token.
 */
export function bestNameMatch<T>(
  query: string,
  candidates: T[],
  describe: (item: T) => string[],
  minScore = 0.67,
): NameMatchResult<T> {
  const qTokens = normalizeNameTokens(query);
  const scored = candidates
    .map((item) => {
      const best = describe(item)
        .map((name) => scoreNameMatch(query, name))
        .reduce<NameMatchScore>((a, b) => (b.score > a.score || (b.score === a.score && b.matched > a.matched) ? b : a), {
          score: 0,
          matched: 0,
          unmatchedQuery: qTokens,
        });
      return { item, ...best };
    })
    .sort((a, b) => b.score - a.score || b.matched - a.matched);

  const top = scored[0];
  const runnerUp = scored[1] ?? null;
  const okTokens = qTokens.length === 1 ? top?.matched >= 1 : top?.matched >= 2;

  if (!top || top.score < minScore || !okTokens) {
    return { match: null, score: top?.score ?? 0, ambiguous: false, runnerUp: runnerUp ? { item: runnerUp.item, score: runnerUp.score } : null };
  }

  const ambiguous = Boolean(runnerUp && runnerUp.score >= top.score - 0.15 && runnerUp.matched === top.matched);
  return {
    match: top.item,
    score: top.score,
    ambiguous,
    runnerUp: runnerUp ? { item: runnerUp.item, score: runnerUp.score } : null,
  };
}

/** MM-DD from "14th March" / "13 September" / "3rd  February". Null if unparseable. */
export function parseYearlessBirthday(raw: string): string | null {
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const m = (raw || '').trim().toLowerCase().match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS.indexOf(m[2]) + 1;
  if (!month || day < 1 || day > 31) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
