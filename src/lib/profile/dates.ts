// Fact dates come in whatever shape the import or the user gave them: "2025-06",
// "2025", "Jun 2025", "present". Code that asks "is this over?" goes through here,
// so the CV prompt and the guard agree on whether someone is still a student.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Year and month (1-12, or null for a bare year) of a date as facts store it, or null if it isn't one. */
export function parseFactDate(s: string | null | undefined): { year: number; month: number | null } | null {
  const t = s?.trim();
  if (!t) return null;
  let m = /^((?:19|20)\d{2})-(\d{1,2})\b/.exec(t);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  m = /^(\d{1,2})\/((?:19|20)\d{2})$/.exec(t);
  if (m) return { year: Number(m[2]), month: Number(m[1]) };
  m = /\b([a-z]{3,})\.?\s+((?:19|20)\d{2})\b/i.exec(t);
  const month = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1 : 0;
  if (m && month) return { year: Number(m[2]), month };
  // "2022 to 2026" as an end date means 2026: the last year wins.
  const years = t.match(/\b(?:19|20)\d{2}\b/g);
  return years ? { year: Number(years[years.length - 1]), month: null } : null;
}

/**
 * Is a degree, job or project over? No end, "Present" or "Current" means it's still going.
 * A bare year counts as finished from 1 July that year: Irish degrees end in May or June,
 * so in October "2026" is a 2026 graduate, not a final-year student. A month counts as
 * finished once it has passed. A date code can't read counts as not finished, so the
 * guard never drops a line on a guess.
 */
export function isFinished(f: { end?: string | null }, now = new Date()): boolean {
  if (!f.end?.trim() || /present|current|now|ongoing/i.test(f.end)) return false;
  const d = parseFactDate(f.end);
  if (!d) return false;
  const year = now.getFullYear();
  if (d.year !== year) return d.year < year;
  return d.month === null ? now.getMonth() >= 6 : d.month < now.getMonth() + 1;
}
