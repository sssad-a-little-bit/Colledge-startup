import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const prisma = path.join(root, "node_modules/prisma/build/index.js");
const next = path.join(root, "node_modules/next/dist/bin/next");

function run(label, script, args = [], env = process.env) {
  console.log(`[vercel-build] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[vercel-build] Could not start ${label}.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

run("Generate Prisma client", prisma, ["generate"]);

if (process.env.VERCEL_ENV === "production") {
  run(
    "Check production configuration",
    path.join(root, "scripts/check-env.mjs"),
  );
  // Only this child uses DIRECT_URL. The application retains its pooled URL.
  const migrationEnv = {
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
  };
  run(
    "Apply production migrations",
    prisma,
    ["migrate", "deploy"],
    migrationEnv,
  );
} else {
  console.log(
    "[vercel-build] Production migrations skipped for this environment.",
  );
}

// User and course data are provisioned separately; builds never run a seed.
run("Build Next.js", next, ["build"]);
