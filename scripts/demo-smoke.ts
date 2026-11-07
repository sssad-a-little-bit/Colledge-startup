import { PrismaClient } from "@prisma/client";
import { ApiClient } from "../tests/helpers";
async function main() {
  const db = new PrismaClient();
  for (const email of [
    "admin@demo.kit.local",
    "teacher@demo.kit.local",
    "student@demo.kit.local",
  ]) {
    const c = await new ApiClient(email).login();
    const r = await c.get("overview");
    if (!r.ok) throw Error("Role smoke failed");
  }
  console.log(
    JSON.stringify({
      demoSmoke: "passed",
      roles: 3,
      users: await db.user.count(),
      lessons: await db.lesson.count(),
      grades: await db.grade.count(),
    }),
  );
  await db.$disconnect();
}
main().catch(() => {
  console.error("DEMO_SMOKE_FAILED");
  process.exitCode = 1;
});
