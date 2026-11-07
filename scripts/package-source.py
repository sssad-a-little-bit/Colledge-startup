"""Package reviewable sources, excluding environment, credentials, dumps and dependencies."""
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent.parent
folders = ["app", "components", "lib", "prisma", "scripts", "tests", "types", "docs", ".github"]
files = [p for folder in folders for p in (root / folder).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
files += [root / p for p in ["README.md", "DEMO_GUIDE.md", "TEST_REPORT.md", "ROADMAP.md", "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs", "playwright.config.ts", "vitest.config.ts", "compose.yaml", "Dockerfile", ".dockerignore", ".gitignore", ".env.example"]]
private_values = []
if (root / ".env").exists():
    for line in (root / ".env").read_text().splitlines():
        if line.startswith("NEXTAUTH_SECRET="):
            private_values.append(line.split("=", 1)[1].strip('"'))
if (root / ".demo-credentials").exists():
    match = re.search(r"Пароль[^\n:]*:\s*(\S+)", (root / ".demo-credentials").read_text())
    if match:
        private_values.append(match.group(1))
for path in files:
    if any(value.encode() in path.read_bytes() for value in private_values if value):
        raise SystemExit("Refusing private value in artifact: " + str(path.relative_to(root)))
with zipfile.ZipFile(root / "kit-campus-source.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        archive.write(path, "kit-campus/" + str(path.relative_to(root)))
print("SOURCE_ARCHIVE_OK files=" + str(len(set(files))))
