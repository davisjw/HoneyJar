import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Drop fenced blocks so sample links are not checked. */
export function stripFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

/** Markdown inline links and reference definitions. Targets only. */
export function extractLinks(markdown) {
  const text = stripFences(markdown);
  const links = [];
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    links.push(match[1]);
  }
  for (const match of text.matchAll(/^\s{0,3}\[[^\]]+\]:\s+(\S+)/gm)) {
    links.push(match[1].replace(/^<|>$/g, ""));
  }
  return links;
}

function hasScheme(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

/** True when the link is a path this repo should contain. Hash-only links are skipped. */
export function isLocalPath(target) {
  if (!target || target.startsWith("#")) return false;
  if (hasScheme(target)) return false;
  return true;
}

export function localPathExists(fromFile, target) {
  const beforeHash = target.split("#")[0].split("?")[0];
  if (!beforeHash) return true;
  let decoded = beforeHash;
  try {
    decoded = decodeURIComponent(beforeHash);
  } catch {
    /* Keep the raw target. A broken escape still has to point at a file. */
  }
  return existsSync(path.resolve(path.dirname(fromFile), decoded));
}

/** Relative links under `docs/*.md`, resolved from each file. */
export function checkDocLinks(root) {
  const dir = path.join(root, "docs");
  const errors = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(dir, name);
    const text = readFileSync(file, "utf8");
    for (const target of extractLinks(text)) {
      if (!isLocalPath(target)) continue;
      if (!localPathExists(file, target)) errors.push(`docs/${name}: ${target}`);
    }
  }
  return errors;
}
