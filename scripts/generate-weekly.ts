import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { almatyInstant } from "../lib/time";
import { encodeCsv } from "../lib/csv";
/** Produces expanded dated lessons for the regular CSV preview/commit workflow. Never writes DB. */
const spec = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  except: z.array(z.string()).default([]),
  series: z
    .array(
      z.object({
        assignmentId: z.string().min(1),
        roomId: z.string().min(1),
        weekday: z.number().int().min(1).max(7),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        note: z.string().max(500).default(""),
      }),
    )
    .min(1)
    .max(50),
});
async function main() {
  const [source, target] = process.argv.slice(2);
  if (!source || !target)
    throw new Error(
      "Usage: node --import tsx scripts/generate-weekly.ts input.json output.csv",
    );
  const raw = await readFile(source, "utf8");
  if (raw.length > 65536) throw new Error("Input too large");
  const p = spec.parse(JSON.parse(raw));
  const from = new Date(p.from + "T12:00:00Z"),
    to = new Date(p.to + "T12:00:00Z");
  if (to < from || to.getTime() - from.getTime() > 180 * 86400000)
    throw new Error("Date range must be 0..180 days");
  const rows: string[][] = [];
  for (let day = from; day <= to; day = new Date(day.getTime() + 86400000)) {
    const d = day.toISOString().slice(0, 10);
    if (p.except.includes(d)) continue;
    for (const s of p.series.filter(
      (s) => s.weekday === ((day.getUTCDay() + 6) % 7) + 1,
    )) {
      const start = almatyInstant(d + "T" + s.start),
        end = almatyInstant(d + "T" + s.end);
      if (end <= start) throw new Error("Lesson end must be after start");
      rows.push([s.assignmentId, s.roomId, start, end, "SCHEDULED", s.note]);
      if (rows.length > 500) throw new Error("At most 500 lessons per CSV");
    }
  }
  await writeFile(
    target,
    encodeCsv([
      ["assignmentId", "roomId", "startsAt", "endsAt", "status", "note"],
      ...rows,
    ]),
  );
  console.log(
    JSON.stringify({
      rows: rows.length,
      next: "Preview and commit this CSV in the admin import screen",
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Generation failed");
  process.exitCode = 1;
});
