/** Convert a wall-clock date through IANA rules, never a hard-coded UTC offset. */
export function almatyInstant(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Expected YYYY-MM-DDTHH:mm");
  const naive = Date.parse(local + "Z");
  if (!Number.isFinite(naive)) throw new Error("Invalid date");
  let guess = naive;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const n = (k: string) => Number(p.find((v) => v.type === k)?.value);
    const wall = Date.UTC(
      n("year"),
      n("month") - 1,
      n("day"),
      n("hour"),
      n("minute"),
      n("second"),
    );
    guess += naive - wall;
  }
  return new Date(guess).toISOString();
}
