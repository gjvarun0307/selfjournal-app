/** A local calendar day, "YYYY-MM-DD". */
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(day: DayKey): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

/** Calendar arithmetic, so a DST change never skips or repeats a day. */
export function shiftDay(day: DayKey, n: number): DayKey {
  const [y, m, d] = parse(day);
  return dayKey(new Date(y, m - 1, d + n));
}

export function dayLabel(day: DayKey, today: DayKey): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = parse(day);
  const sameYear = y === parse(today)[0];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}
