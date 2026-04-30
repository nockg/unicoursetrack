import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { extname, join, relative } from "node:path";

const ignoredDirs = new Set([
  ".git",
  ".vercel",
  "node_modules",
  "dist",
  "public/generated",
  ".deploy-unicoursetrack",
  "backup-deployments"
]);

const ignoredFiles = new Set([
  "scripts/security-check.mjs",
  "public/config.js",
  "public/config.local.js",
  "public/config.example.js",
  "README.md",
  "SECURITY.md",
  ".env.example"
]);

const textExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".json",
  ".md",
  ".sql"
]);

const unsafeProtocols = [
  "java" + "script:",
  "vb" + "script:",
  "data:text/html"
];

const findings = [];

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function isTrackedByGit(path) {
  try {
    const output = execSync(`git ls-files -- "${path}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    return output === path;
  } catch {
    return false;
  }
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = toPosix(relative(process.cwd(), fullPath));

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(fullPath);
      continue;
    }

    if (ignoredFiles.has(relPath)) continue;
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;

    scanFile(fullPath, relPath);
  }
}

function isServerSideFile(relPath) {
  return (
    relPath.startsWith("api/") ||
    relPath.startsWith("scripts/") ||
    relPath.startsWith("supabase/")
  );
}

function scanFile(fullPath, relPath) {
  const text = readFileSync(fullPath, "utf8");

  if (/SUPABASE_SERVICE_ROLE_KEY/i.test(text) && !isServerSideFile(relPath)) {
    findings.push(`Service role key reference in client-facing file: ${relPath}`);
  }

  if (/service[_-]?role/i.test(text) && !isServerSideFile(relPath)) {
    findings.push(`Potential service-role reference in client-facing file: ${relPath}`);
  }

  if (/https:\/\/[a-z0-9]{20}\.supabase\.co/i.test(text)) {
    findings.push(`Hardcoded Supabase project URL: ${relPath}`);
  }

  if (/sb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}/.test(text)) {
    findings.push(`Hardcoded Supabase key: ${relPath}`);
  }

  const lower = text.toLowerCase();
  for (const protocol of unsafeProtocols) {
    if (lower.includes(protocol)) {
      findings.push(`Unsafe ${protocol} URL literal: ${relPath}`);
    }
  }
}

if (isTrackedByGit("public/config.js")) {
  findings.push("public/config.js is tracked by Git. Remove it with: git rm --cached public/config.js");
}

if (existsSync("public/config.js") && !isTrackedByGit("public/config.js")) {
  console.warn("Note: public/config.js exists locally but is not tracked by Git. That is okay for local/generated config.");
}

walk(process.cwd());

if (findings.length) {
  console.error("UniTrack security check failed:\n");
  findings.forEach((finding) => console.error(`- ${finding}`));
  console.error("\nFix these before deploying.");
  process.exit(1);
}

console.log("UniTrack security check passed.");