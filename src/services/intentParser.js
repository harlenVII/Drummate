/**
 * intentParser.js — Regex-based intent extraction from voice transcripts.
 *
 * parseIntent(text) → { action, ...params }
 * findBestItemMatch(query, items) → item | null
 */

export function parseIntent(rawText) {
  // Strip leading "drummate" (mic may capture tail of wake word)
  const t = rawText.toLowerCase().trim().replace(/^drummate\s*/i, '');

  // ---- METRONOME START ----
  if (/\b(start|play|drop)\b.*(metronome|beat|click)\b/i.test(t))
    return { action: 'metronome.start' };

  // ---- STOP (universal — but not practice-specific) ----
  if (/^(stop|pause|halt|quiet|silence)\b/i.test(t) && !/(timer|practicing|practice)/i.test(t))
    return { action: 'metronome.stop' };

  // ---- SET TEMPO ----
  const bpmMatch =
    t.match(/(?:set\s+)?(?:tempo|bpm)\s+(?:to\s+)?(\d{2,3})/i) ||
    t.match(/(\d{2,3})\s+(?:bpm|beats?\s+per\s+minute)/i);
  if (bpmMatch) {
    const v = parseInt(bpmMatch[1]);
    if (v >= 30 && v <= 300) return { action: 'metronome.setTempo', value: v };
  }

  // ---- ADJUST TEMPO ----
  const adjustMatch = t.match(
    /(increase|raise|faster?|speed\s+up|decrease|lower|slower?|slow\s+down)\b.+?(\d+)/i,
  );
  if (adjustMatch) {
    const delta = parseInt(adjustMatch[2]);
    const sign = /(increase|raise|faster?|speed\s+up)/i.test(adjustMatch[1]) ? 1 : -1;
    return { action: 'metronome.adjustTempo', delta: sign * delta };
  }

  // ---- TIME SIGNATURE ----
  const tsMatch =
    t.match(/(?:set\s+)?(?:time\s+signature|meter)\s+(?:to\s+)?(\d+)\s*[/]\s*(\d+)/i) ||
    t.match(/(\d+)\s*[/]\s*(\d+)\s+(?:time|meter)/i);
  if (tsMatch) {
    const num = parseInt(tsMatch[1]);
    const den = parseInt(tsMatch[2]);
    const valid = [
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4],
    ];
    if (valid.some(([n, d]) => n === num && d === den))
      return { action: 'metronome.setTimeSignature', value: [num, den] };
  }

  // ---- SUBDIVISION ----
  const subMap = {
    quarter: 'quarter',
    quarters: 'quarter',
    eighth: 'eighth',
    eighths: 'eighth',
    'eighth note': 'eighth',
    triplet: 'triplet',
    triplets: 'triplet',
    sixteenth: 'sixteenth',
    sixteenths: 'sixteenth',
    'sixteenth note': 'sixteenth',
  };
  const subMatch = t.match(
    /(?:switch\s+to|set|use|play)\s+(?:the\s+)?([a-z\s]+?)(?:\s+(?:notes?|beats?|subdivision))?$/i,
  );
  if (subMatch) {
    const key = subMatch[1].trim().toLowerCase();
    if (subMap[key]) return { action: 'metronome.setSubdivision', value: subMap[key] };
  }

  // ---- PRACTICE STOP ----
  if (/(stop|pause)\b.*(timer|practicing|practice)/i.test(t))
    return { action: 'practice.stop' };

  // ---- PRACTICE START ----
  const practiceMatch = t.match(/\bstart\b\s+(?:practicing?\s+|working\s+on\s+)?(.+)/i);
  if (practiceMatch && !/(metronome|beat|click)/i.test(practiceMatch[1]))
    return { action: 'practice.start', itemQuery: practiceMatch[1].trim() };

  // ---- REPORTS ----
  const reportMatch = t.match(
    /(?:generate|show|get|open)\s+(?:the\s+)?(?:daily\s+)?report\s*(?:for|of)?\s*(today|yesterday)?/i,
  );
  if (reportMatch) return { action: 'report.generate', date: reportMatch[1]?.trim() || 'today' };

  // ---- NAVIGATION ----
  const navMatch = t.match(
    /(?:go\s+to|switch\s+to|open|show)\s+(practice|metronome|report|sequencer)/i,
  );
  if (navMatch) {
    const tab = navMatch[1].toLowerCase();
    return tab === 'sequencer'
      ? { action: 'navigate', tab: 'metronome', subpage: 'sequencer' }
      : { action: 'navigate', tab };
  }

  // ---- LANGUAGE TOGGLE ----
  if (/(?:switch|toggle|change)\s+language/i.test(t)) return { action: 'toggleLanguage' };

  // ---- UNKNOWN ----
  return { action: 'unknown', text: rawText };
}

/**
 * Levenshtein edit distance between two strings.
 */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the best-matching practice item for a spoken query.
 * Returns the item or null if no match is close enough.
 */
export function findBestItemMatch(itemQuery, items) {
  if (!items || items.length === 0) return null;

  const query = itemQuery.toLowerCase().trim();

  // Exact match
  const exact = items.find((item) => item.name.toLowerCase() === query);
  if (exact) return exact;

  // Substring match
  const sub = items.find(
    (item) => item.name.toLowerCase().includes(query) || query.includes(item.name.toLowerCase()),
  );
  if (sub) return sub;

  // Fuzzy match with Levenshtein
  let best = null;
  let bestDist = Infinity;
  for (const item of items) {
    const dist = levenshtein(query, item.name.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }

  const threshold = Math.max(2, Math.floor((best?.name.length ?? 0) * 0.35));
  return bestDist <= threshold ? best : null;
}
