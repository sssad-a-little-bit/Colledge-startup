import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { ApiClient } from "../tests/helpers";
async function main() {
  if (!/campus_demo/.test(process.env.DATABASE_URL || ""))
    throw Error("Dedicated demo DB required");
  const db = new PrismaClient();
  const grades =
    await db.$queryRaw`SELECT count(*)::text AS count, md5(coalesce(string_agg(id||':'||version::text||':'||coalesce(value::text,'null'),'|' ORDER BY id),'')) AS digest FROM "Grade"`;
  const lessons =
    await db.$queryRaw`SELECT count(*)::text AS count, md5(coalesce(string_agg(id||':'||version::text||':'||"startsAt"::text,'|' ORDER BY id),'')) AS digest FROM "Lesson"`;
  const result = { grades, lessons };
  const file = "/tmp/kit-app-restart-before.json";
  if (process.argv[2] === "before")
    await writeFile(file, JSON.stringify(result));
  else {
    const before = JSON.parse(await readFile(file, "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(result))
      throw Error("Restart changed data");
    const c = await new ApiClient("student@demo.kit.local").login();
    const r = await c.get("grades");
    if (!r.ok) throw Error("Student read failed after restart");
    await writeFile(
      "docs/app-restart-result.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          applicationRestart: "passed",
          databaseFingerprintsMatch: true,
          studentAuthenticatedRead: r.status,
          ...result,
        },
        null,
        2,
      ) + "\n",
    );
    console.log("APP_RESTART_OK");
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Restart check failed");
  process.exitCode = 1;
});
