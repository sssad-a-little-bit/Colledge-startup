/**
 * Standalone HTTP authentication check against a running production build.
 * AUTH_LIVE_TEST=1 TEST_DATABASE_URL=postgresql://.../campus_demo BASE_URL=http://localhost:3000 node tests/auth-live.mjs
 * Creates and deletes only a unique synthetic account and its own limiter row.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

if (process.env.AUTH_LIVE_TEST !== "1")
  throw new Error("Explicit AUTH_LIVE_TEST=1 is required");
const databaseURL = process.env.TEST_DATABASE_URL;
if (
  !databaseURL ||
  !/^\/campus_(demo|test)$/.test(new URL(databaseURL).pathname)
) {
  throw new Error(
    "TEST_DATABASE_URL must explicitly point to campus_demo or campus_test",
  );
}
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const baseOrigin = new URL(baseURL).origin;
const db = new PrismaClient({ datasourceUrl: databaseURL });
const fixtureId = "auth-live-" + randomUUID();
const email = fixtureId + "@demo.kit.local";
const password = randomBytes(24).toString("base64url");
const key = createHash("sha256").update(`login:${email}`).digest("hex");
let created = false;
let checks = 0;
let stage = "readiness";

class Client {
  cookies = new Map();
  async fetch(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Origin", baseOrigin);
    if (this.cookies.size)
      headers.set(
        "Cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    const response = await fetch(new URL(path, baseURL), {
      ...options,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";", 1)[0],
        index = first.indexOf("=");
      this.cookies.set(first.slice(0, index), first.slice(index + 1));
    }
    return response;
  }
  async signIn(candidate) {
    const csrfResponse = await this.fetch("/api/auth/csrf");
    assert.equal(csrfResponse.status, 200, "CSRF endpoint must be available");
    const { csrfToken } = await csrfResponse.json();
    assert.equal(typeof csrfToken, "string");
    const response = await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email,
        password: candidate,
        csrfToken,
        callbackUrl: baseOrigin + "/campus",
        json: "true",
      }),
    });
    assert.ok(
      response.status < 500,
      "Authentication must not produce a server error",
    );
    const payload = await response.text();
    assert.equal(
      payload.includes(password),
      false,
      "Authentication response must not echo the password",
    );
    const sessionResponse = await this.fetch("/api/auth/session");
    assert.equal(sessionResponse.status, 200);
    const session = await sessionResponse.json();
    return session.user?.id || null;
  }
}

try {
  const ready = await fetch(new URL("/api/health/ready", baseURL), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    ready.status,
    200,
    "Start the application with the same isolated test database first",
  );
  stage = "create-synthetic-account";
  await db.user.create({
    data: {
      id: fixtureId,
      email,
      name: "Проверка защиты входа — вымышленный пользователь",
      passwordHash: await hash(password, 12),
      role: "STUDENT",
      active: true,
    },
  });
  created = true;
  stage = "baseline-login";
  const initial = new Client();
  assert.equal(
    await initial.signIn(password),
    fixtureId,
    "Real credentials login must work before limiter testing",
  );
  checks++;

  stage = "invalid-logins";
  const rejected = new Client();
  for (let index = 0; index < 11; index++) {
    assert.equal(
      await rejected.signIn("incorrect-" + randomBytes(12).toString("hex")),
      null,
      "Invalid password must not create a session",
    );
  }
  checks++;
  stage = "persistent-lock";
  const locked = await db.loginAttempt.findUniqueOrThrow({ where: { key } });
  assert.ok(
    locked.count > 10 &&
      locked.blockedUntil &&
      locked.blockedUntil.getTime() > Date.now(),
    "Limiter state must be persisted with a future block",
  );
  checks++;
  stage = "correct-password-blocked";
  assert.equal(
    await new Client().signIn(password),
    null,
    "Correct password must also be rejected while the account is rate limited",
  );
  checks++;

  stage = "simulated-expiry";
  // Simulate time passing for this disposable account instead of a 15-minute sleep.
  await db.loginAttempt.update({
    where: { key },
    data: {
      blockedUntil: new Date(Date.now() - 1_000),
      updatedAt: new Date(Date.now() - 16 * 60_000),
    },
  });
  assert.equal(
    await new Client().signIn(password),
    fixtureId,
    "Login must recover after the simulated limiter expiry",
  );
  checks++;
  const reset = await db.loginAttempt.findUniqueOrThrow({ where: { key } });
  assert.equal(reset.count, 0);
  assert.equal(reset.blockedUntil, null);
  checks++;
  console.log(
    JSON.stringify({
      test: "auth-live",
      result: "passed",
      checks,
      invalidAttempts: 11,
      expiry: "simulated only for the disposable limiter row",
      secretsLogged: false,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      test: "auth-live",
      result: "failed",
      stage,
      completedChecks: checks,
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await db.loginAttempt.deleteMany({ where: { key } });
    if (created) await db.user.delete({ where: { id: fixtureId } });
  } catch {
    console.error(
      JSON.stringify({
        test: "auth-live",
        result: "cleanup-failed",
        syntheticFixtureId: fixtureId,
      }),
    );
    process.exitCode = 1;
  }
  await db.$disconnect();
}
