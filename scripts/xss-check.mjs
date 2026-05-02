import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ignoredDirs = new Set([
  ".git",
  ".vercel",
  ".claude",
  "node_modules",
  "dist",
  "public/generated",
  ".deploy-unicoursetrack",
  "backup-deployments"
]);

const ignoredFiles = new Set([
  "scripts/xss-check.mjs",
  "scripts/security-check.mjs",
  "public/config.js",
  "public/config.local.js",
  "public/config.example.js"
]);

const textExtensions = new Set([".js", ".mjs", ".html"]);
const findings = [];
const warnings = [];

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function shouldScan(relPath) {
  if (ignoredFiles.has(relPath)) return false;
  return textExtensions.has(extname(relPath).toLowerCase());
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

    if (shouldScan(relPath)) scanFile(fullPath, relPath);
  }
}

function hasUnsafeProtocol(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("javascript:") ||
    lower.includes("vbscript:") ||
    lower.includes("data:text/html")
  );
}

function scanFile(fullPath, relPath) {
  const text = readFileSync(fullPath, "utf8");

  if (hasUnsafeProtocol(text)) {
    findings.push(`${relPath}: unsafe URL protocol literal found`);
  }

  if (/\beval\s*\(/.test(text)) {
    findings.push(`${relPath}: eval() usage found`);
  }

  if (/\bnew\s+Function\s*\(/.test(text)) {
    findings.push(`${relPath}: new Function() usage found`);
  }

  if (/\bdocument\.write\s*\(/.test(text)) {
    findings.push(`${relPath}: document.write() usage found`);
  }

  if (/\.srcdoc\s*=/.test(text)) {
    findings.push(`${relPath}: iframe srcdoc assignment found`);
  }

  if (/set(?:Timeout|Interval)\s*\(\s*["'`]/.test(text)) {
    findings.push(`${relPath}: string-based setTimeout/setInterval found`);
  }

  const htmlSinkRegex = /(?:\.innerHTML|\.outerHTML)\s*=\s*([`'"][\s\S]*?[`'"]|[A-Za-z_$][\w$]*)|\.insertAdjacentHTML\s*\(\s*[^,]+,\s*([`'"][\s\S]*?[`'"]|[A-Za-z_$][\w$]*)\s*\)/g;

  let match;
  while ((match = htmlSinkRegex.exec(text))) {
    const sink = (match[1] || match[2] || "").trim();

    if (!sink || sink === '""' || sink === "''") continue;

    const hasInterpolation = sink.startsWith("`") && /\$\{/.test(sink);
    const usesEscaper =
      /escapeHtml\s*\(/.test(sink) ||
      /escapeSafe\s*\(/.test(sink) ||
      /sanitizeHtml\s*\(/.test(sink) ||
      /encodeURIComponent\s*\(/.test(sink);

    if (hasInterpolation && !usesEscaper) {
      findings.push(`${relPath}: possible unescaped template data inside innerHTML/insertAdjacentHTML`);
    } else if (hasInterpolation) {
      warnings.push(`${relPath}: review escaped template HTML sink`);
    }
  }

  if (/\son[a-z]+\s*=/.test(text)) {
    warnings.push(`${relPath}: inline event handler attribute found; review when removing unsafe-inline CSP later`);
  }
}

walk(process.cwd());

if (warnings.length) {
  console.warn("UniTrack XSS check warnings:\n");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
  console.warn("");
}

if (findings.length) {
  console.error("UniTrack XSS check failed:\n");
  findings.forEach((finding) => console.error(`- ${finding}`));
  console.error("\nFix these before deploying.");
  process.exit(1);
}

console.log("UniTrack XSS check passed.");
