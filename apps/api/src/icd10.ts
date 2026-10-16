import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Icd10Code = { code: string; title: string };

type Entry = Icd10Code & { bare: string; hay: string };

// CMS ICD-10-CM FY2026 billable codes (public domain). Dotted for display.
const entries: Entry[] = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "data/icd10-cm.txt"), "utf8")
  .split("\n")
  .flatMap((line) => {
    const tab = line.indexOf("\t");
    if (tab <= 0) return [];
    const code = line.slice(0, tab).trim();
    const title = line.slice(tab + 1).trim();
    if (!code || !title) return [];
    return [{ code, title, bare: code.replace(".", "").toLowerCase(), hay: title.toLowerCase() }];
  });

const byCode = new Map(entries.map((entry) => [entry.code, entry.title]));

export function icd10Title(code: string) {
  return byCode.get(code.trim().toUpperCase()) ?? null;
}

export function searchIcd10(query: string, limit = 25): Icd10Code[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const bare = needle.replace(/\./g, "");
  const prefix: Icd10Code[] = [];
  const text: Icd10Code[] = [];
  for (const entry of entries) {
    if (entry.bare.startsWith(bare)) prefix.push(entry);
    else if (entry.hay.includes(needle)) text.push(entry);
    if (prefix.length >= limit && text.length >= limit) break;
  }
  return [...prefix, ...text].slice(0, limit).map(({ code, title }) => ({ code, title }));
}
