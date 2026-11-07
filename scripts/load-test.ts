/** Run only against a dedicated demo database and a production `next start` server.
 * LOAD_TEST=1 DATABASE_URL=... BASE_URL=http://localhost:3000 npx tsx scripts/load-test.ts
 * Defaults: 100 distinct users, 10s ramp, 60s steady state, 0.75..1.25s think time.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { ApiClient, baseURL } from "../tests/helpers";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  if (
    process.env.LOAD_TEST !== "1" ||
    !/^\/campus_(demo|test)$/.test(
      new URL(process.env.DATABASE_URL || "postgresql://invalid/").pathname,
    )
  )
    throw new Error(
      "Set LOAD_TEST=1 and DATABASE_URL for dedicated campus_demo/campus_test only",
    );
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
    throw new Error("Local production-like server required");
  const users = Number(process.env.LOAD_USERS || 100),
    rampSeconds = Number(process.env.LOAD_RAMP || 10),
    durationSeconds = Number(process.env.LOAD_DURATION || 60);
  if (!Number.isInteger(users) || users < 1 || users > 100)
    throw new Error("LOAD_USERS must be 1..100");
  if (
    durationSeconds < 10 ||
    durationSeconds > 300 ||
    rampSeconds < 1 ||
    rampSeconds > 60
  )
    throw new Error("Invalid duration/ramp");
  const db = new PrismaClient();
  const runId = randomUUID().slice(0, 8),
    password = randomBytes(24).toString("base64url");
  const passwordHash = await hash(password, 10);
  const membership = await db.membership.findFirst({
    where: { userId: "demo-student" },
  });
  if (!membership) throw new Error("Run the explicit demo seed first");
  const accounts = Array.from({ length: users }, (_, i) => ({
    id: `load-${runId}-${i}`,
    email: `load-${runId}-${i}@demo.kit.local`,
    name: `Нагрузочный тест ${i + 1}`,
    passwordHash,
    role: "STUDENT" as const,
  }));
  await db.$transaction(async (tx) => {
    await tx.user.createMany({ data: accounts });
    await tx.membership.createMany({
      data: accounts.map((a) => ({
        userId: a.id,
        groupId: membership.groupId,
        periodId: membership.periodId,
        startsAt: membership.startsAt,
      })),
    });
  });
  const dbCounts = {
    users: await db.user.count(),
    lessons: await db.lesson.count(),
    assessments: await db.assessment.count(),
    grades: await db.grade.count(),
    news: await db.news.count(),
  };
  const clients: ApiClient[] = Array(users);
  // Login uses separate sessions and credentials. It is setup, excluded from measured requests.
  for (let index = 0; index < users; index += 5)
    await Promise.all(
      accounts.slice(index, index + 5).map(async (a, j) => {
        clients[index + j] = await new ApiClient(a.email).login(
          a.email,
          password,
        );
      }),
    );
  const metrics: {
    ms: number;
    status: number;
    operation: string;
    phase: string;
  }[] = [];
  const start = performance.now(),
    steadyStart = start + rampSeconds * 1000,
    end = steadyStart + durationSeconds * 1000;
  let peak = 0,
    active = 0;
  await Promise.all(
    clients.map(async (client, index) => {
      await sleep(index * ((rampSeconds * 1000) / users));
      active++;
      peak = Math.max(peak, active);
      let iteration = 0;
      while (performance.now() < end) {
        // Deterministic balanced profile: 70% private schedule, 25% audience-filtered news, 5% permitted own profile writes.
        const bucket = (iteration++ + index) % 20,
          operation =
            bucket < 14 ? "schedule" : bucket < 19 ? "news" : "profile-write";
        const began = performance.now();
        let status = 0;
        try {
          const result =
            operation === "profile-write"
              ? await client.post({
                  action: "saveProfile",
                  bio: "Синтетическое нагрузочное испытание",
                  phone: "",
                  key: randomUUID(),
                })
              : await client.get(operation);
          status = result.status;
          await result.arrayBuffer();
        } catch {
          status = 0;
        }
        metrics.push({
          ms: performance.now() - began,
          status,
          operation,
          phase: began >= steadyStart ? "steady" : "ramp",
        });
        await sleep(750 + Math.random() * 500);
      }
      active--;
    }),
  );
  const summarise = (rows: typeof metrics) => {
    const times = rows.map((r) => r.ms).sort((a, b) => a - b),
      quantile = (q: number) =>
        times[Math.min(times.length - 1, Math.floor(times.length * q))] || 0;
    const errors = rows.filter((r) => r.status < 200 || r.status >= 300).length;
    const statusCounts: Record<string, number> = {};
    for (const row of rows)
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    return {
      requests: rows.length,
      errors,
      errorRate: rows.length ? errors / rows.length : 0,
      p50Ms: Math.round(quantile(0.5) * 100) / 100,
      p95Ms: Math.round(quantile(0.95) * 100) / 100,
      statusCounts,
    };
  };
  const report = {
    runId,
    timestamp: new Date().toISOString(),
    baseURL,
    serverMode:
      "Requires next build + next start; verify server command separately",
    distinctAuthenticatedUsers: users,
    peakActiveUsers: peak,
    rampSeconds,
    steadySeconds: durationSeconds,
    totalWallSeconds: Math.round((performance.now() - start) / 1000),
    thinkTimeMs: [750, 1250],
    profile: {
      privateSchedule: 0.7,
      audienceFilteredNews: 0.25,
      ownProfileWrite: 0.05,
    },
    database: dbCounts,
    environment: {
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      logicalCPUs: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    ramp: summarise(metrics.filter((r) => r.phase === "ramp")),
    steady: summarise(metrics.filter((r) => r.phase === "steady")),
    operations: Object.fromEntries(
      ["schedule", "news", "profile-write"].map((op) => [
        op,
        summarise(
          metrics.filter((r) => r.operation === op && r.phase === "steady"),
        ),
      ]),
    ),
    limitations: [
      "Local loopback only; no WAN or TLS proxy overhead measured",
      "Users perform reads and permitted profile changes; no simultaneous grading workload",
      "Infrastructure shares CPU and memory with generator; no cgroup resource limits",
      "Synthetic data volume only; no availability guarantee",
    ],
  };
  await writeFile(
    "docs/load-result.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  // Synthetic accounts are disabled, not silently deleted. No load password is persisted.
  await db.user.updateMany({
    where: { id: { in: accounts.map((a) => a.id) } },
    data: { active: false },
  });
  await db.$disconnect();
  if (report.steady.errors) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Load test failed");
  process.exitCode = 1;
});
