export function getBangkokYesterday(now = new Date()) {
  const range = getBangkokPreviousDays(now, 1);
  return {
    date: range.until,
    since: range.since,
    until: range.until
  };
}

export function getBangkokPreviousDays(now = new Date(), days = 7) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const bangkokMidnightUtc = Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day));
  const untilDate = new Date(bangkokMidnightUtc - 24 * 60 * 60 * 1000);
  const sinceDate = new Date(bangkokMidnightUtc - days * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString().slice(0, 10);
  const until = untilDate.toISOString().slice(0, 10);

  return {
    date: until,
    since,
    until,
    days
  };
}
