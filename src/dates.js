export function getBangkokYesterday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const bangkokMidnightUtc = Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day));
  const yesterday = new Date(bangkokMidnightUtc - 24 * 60 * 60 * 1000);
  const date = yesterday.toISOString().slice(0, 10);

  return {
    date,
    since: date,
    until: date
  };
}
