import nextEnv from "@next/env";
const {loadEnvConfig}=nextEnv;
loadEnvConfig(process.cwd());
const issues = [];
try {
  const u = new URL(process.env.DATABASE_URL || "");
  if (!["postgres:", "postgresql:"].includes(u.protocol))
    issues.push("DATABASE_URL");
} catch {
  issues.push("DATABASE_URL");
}
try {
  new URL(process.env.NEXTAUTH_URL || "");
} catch {
  issues.push("NEXTAUTH_URL");
}
if (
  (process.env.NEXTAUTH_SECRET || "").length < 32 ||
  /placeholder|replace_with|build_only/i.test(process.env.NEXTAUTH_SECRET || "")
)
  issues.push("NEXTAUTH_SECRET (at least 32 characters)");
if (issues.length) {
  console.error(
    JSON.stringify({ event: "invalid_configuration", fields: issues }),
  );
  process.exit(1);
}
