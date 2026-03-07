#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SECRET_RULES = [
  { id: "openai-key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { id: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: "private-key-header", re: /BEGIN (?:RSA|EC|OPENSSH|DSA) PRIVATE KEY/g },
  { id: "generic-api-key-assignment", re: /\b(?:API_KEY|PRIVATE_KEY|SEED_PHRASE|MNEMONIC)\s*=\s*["']?[A-Za-z0-9+/_=-]{12,}/g },
];

const PERSONAL_RULES = [
  { id: "local-user-path", re: /\/Users\/[^/\s]+\//g },
];

const LOCAL_BLOCKLIST_FILE = ".public-safety-blocklist.txt";
const ALL_RULES = [...SECRET_RULES, ...PERSONAL_RULES];
const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);
const SKIP_PATHS = new Set([
  "scripts/public-safety-check.mjs",
]);

function getTrackedFiles() {
  const output = execSync("git ls-files", { encoding: "utf8" });
  return output
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRegex(raw) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addLocalBlocklistRules() {
  if (!existsSync(LOCAL_BLOCKLIST_FILE)) return;

  const lines = readFileSync(LOCAL_BLOCKLIST_FILE, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));

  for (const token of lines) {
    ALL_RULES.push({
      id: "local-blocklist",
      re: new RegExp(escapeRegex(token), "gi"),
    });
  }
}

function shouldSkip(file) {
  if (SKIP_PATHS.has(file)) return true;
  const ext = path.extname(file).toLowerCase();
  return SKIP_EXTENSIONS.has(ext);
}

function lineFromIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function scanFile(file) {
  if (shouldSkip(file)) return [];

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  if (content.includes("\u0000")) return [];

  const findings = [];
  for (const rule of ALL_RULES) {
    rule.re.lastIndex = 0;
    let match = rule.re.exec(content);
    while (match) {
      findings.push({
        file,
        ruleId: rule.id,
        line: lineFromIndex(content, match.index),
        sample: match[0].slice(0, 120),
      });
      match = rule.re.exec(content);
    }
  }
  return findings;
}

function main() {
  addLocalBlocklistRules();
  const files = getTrackedFiles();
  const findings = files.flatMap(scanFile);
  if (findings.length === 0) {
    console.log("Public safety check passed: no blocked personal details or secrets found.");
    return;
  }

  console.error("Public safety check failed. Blocked values detected:");
  for (const f of findings.slice(0, 50)) {
    console.error(`- ${f.file}:${f.line} [${f.ruleId}] ${f.sample}`);
  }
  if (findings.length > 50) {
    console.error(`... and ${findings.length - 50} more findings`);
  }
  process.exit(1);
}

main();
