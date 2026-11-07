import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());
if (
  !process.env.TEST_DATABASE_URL ||
  !/campus_(demo|test)/.test(process.env.TEST_DATABASE_URL)
) {
  console.error(
    "Set TEST_DATABASE_URL explicitly to a dedicated campus_demo or campus_test PostgreSQL database. Tests were NOT run.",
  );
  process.exit(2);
}
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/integration.test.ts"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
