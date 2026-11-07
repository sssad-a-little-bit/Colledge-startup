/** Intentionally interrupts ONLY the isolated container kit-campus-db. */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { ApiClient, baseURL } from "../tests/helpers";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  if (
    process.env.RESILIENCE_TEST !== "1" ||
    !/\/campus_demo(?:\?|$)/.test(process.env.DATABASE_URL || "")
  )
    throw Error("Requires explicit isolated campus_demo database");
  const container = "kit-campus-db",
    client = await new ApiClient("student@demo.kit.local").login(),
    db = new PrismaClient();
  const profile = (await (await client.get("profile")).json()).data,
    before = await db.grade.count(),
    marker = "resilience-" + randomUUID();
  const body = {
    action: "saveProfile",
    bio: marker,
    phone: profile.phone,
    key: randomUUID(),
  };
  const controller = new AbortController();
  const aborted = client
    .fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    .catch(() => null);
  controller.abort();
  await aborted;
  const retry = await client.post(body);
  if (retry.status !== 200) throw Error("Idempotent retry failed");
  if ((await (await client.get("profile")).json()).data.bio !== marker)
    throw Error("Confirmed data missing");
  execFileSync("docker", ["restart", container], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(baseURL + "/api/health/ready")).ok) break;
    } catch {}
    await sleep(500);
  }
  // This verifier had its own idle connection before the intentional restart.
  // Reconnect that read-only verifier; application recovery is checked over HTTP.
  await db.$disconnect();
  await db.$connect();
  if (
    (await (await client.get("profile")).json()).data.bio !== marker ||
    (await db.grade.count()) !== before
  )
    throw Error("Data lost after database restart");
  let live = 0,
    ready = 0,
    write = 0;
  try {
    execFileSync("docker", ["stop", container], { stdio: "ignore" });
    live = (await fetch(baseURL + "/api/health/live")).status;
    ready = (await fetch(baseURL + "/api/health/ready")).status;
    write = (
      await client.post({
        action: "saveProfile",
        bio: "MUST_NOT_SAVE",
        phone: "",
        key: randomUUID(),
      })
    ).status;
    if (live !== 200 || ready !== 503 || write !== 503)
      throw Error("Failure incorrectly acknowledged");
  } finally {
    execFileSync("docker", ["start", container], { stdio: "ignore" });
  }
  let recovered = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(baseURL + "/api/health/ready")).ok) {
        recovered = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!recovered) throw Error("Database did not recover");
  await db.$disconnect();
  await db.$connect();
  if ((await (await client.get("profile")).json()).data.bio !== marker)
    throw Error("Failed write unexpectedly persisted");
  await client.post({
    action: "saveProfile",
    bio: profile.bio,
    phone: profile.phone,
    key: randomUUID(),
  });
  await writeFile(
    "docs/resilience-result.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        interruptedRequestSafeRetry: "passed",
        databaseRestartPersistence: "passed",
        gradeCountBefore: before,
        gradeCountAfter: await db.grade.count(),
        databaseUnavailable: {
          livenessStatus: live,
          readinessStatus: ready,
          writeStatus: write,
        },
        recovery: "passed",
        limitations: [
          "Loopback AbortController interruption, not physical network fault",
          "Application restart tested separately; no host power loss simulated",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  await db.$disconnect();
  console.log("RESILIENCE_OK");
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Resilience test failed");
  process.exitCode = 1;
});
