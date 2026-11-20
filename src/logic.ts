/** Pure helpers. No I/O, so the unit test can import this file directly. */

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  js: "JavaScript",
  py: "Python",
  golang: "Go",
  rs: "Rust",
  rb: "Ruby",
  kt: "Kotlin",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  csharp: "C#",
};

const FILE_EXTS = new Set([
  "c", "cc", "cpp", "cs", "css", "go", "h", "hpp", "html", "java", "js", "jsx",
  "json", "kt", "kts", "md", "mjs", "php", "py", "rb", "rs", "scss", "sh", "sql",
  "svelte", "swift", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml",
]);

const STOP = new Set([
  "about", "after", "again", "also", "because", "before", "being", "could",
  "error", "first", "from", "have", "hello", "issue", "just", "more", "only",
  "other", "please", "should", "some", "such", "thanks", "that", "their",
  "there", "these", "they", "this", "using", "which", "with", "would", "your",
]);

export function languageName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("language is required");
  return LANGUAGES[trimmed.toLowerCase()] ?? trimmed;
}

export function quoteQualifier(value: string): string {
  return /[^A-Za-z0-9+#]/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

export function topicQualifier(topic: string | undefined): string | null {
  if (!topic) return null;
  const cleaned = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export function parseRepo(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const url = trimmed.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  const short = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  const match = url ?? short;
  if (!match) {
    throw new Error(
      "Pass a repository as owner/name or https://github.com/owner/name",
    );
  }
  return { owner: match[1], repo: match[2] };
}

export function parseIssueUrl(input: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const match = input
    .trim()
    .match(/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/i);
  if (!match) {
    throw new Error(
      "Pass an issue URL like https://github.com/owner/repo/issues/123",
    );
  }
  if (match[3].toLowerCase() === "pull") {
    throw new Error("That URL is a pull request. Pass an issue URL.");
  }
  return { owner: match[1], repo: match[2], number: Number(match[4]) };
}

export function branchName(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `first-pr/${number}-${slug || "fix"}`;
}

export function daysSince(iso: string, now = Date.now()): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return Math.round(value);
}

export function daysLabel(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/** Filenames the issue actually mentions. URLs are stripped first. */
export function extractFiles(text: string): string[] {
  const stripped = text.replace(/https?:\/\/\S+/g, " ");
  const re =
    /(?:^|[\s`'"(])((?:[\w.-]+\/)*[A-Za-z][\w.-]*\.([A-Za-z0-9]{1,8}))(?=$|[\s`'")\],.:])/g;
  const found: string[] = [];
  for (const match of stripped.matchAll(re)) {
    const file = match[1];
    const ext = match[2].toLowerCase();
    const nested = file.includes("/");
    if (!nested && !FILE_EXTS.has(ext)) continue;
    if (file.length > 120 || found.includes(file)) continue;
    found.push(file);
    if (found.length === 8) break;
  }
  return found;
}

export function searchTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9_]{4,}/g) ?? []) {
    if (STOP.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word]) => word);
}

/** The first install/setup/contributing section, capped so the tool stays short. */
export function setupExcerpt(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const heading = /^(#{1,3})\s+(.+)$/;
  const interesting =
    /install|setup|getting started|quick start|development|contribut|build from source/i;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(heading);
    if (!match || !interesting.test(match[2])) continue;
    const level = match[1].length;
    const chunk = [lines[i]];
    for (let j = i + 1; j < lines.length && chunk.length < 8; j++) {
      const next = lines[j].match(heading);
      if (next && next[1].length <= level) break;
      chunk.push(lines[j]);
    }
    const text = chunk.join("\n").trim();
    if (!text) continue;
    const cut = text.slice(0, 500);
    // Don't return a code fence the slice cut in half.
    if ((cut.match(/```/g) ?? []).length % 2 === 1) {
      const fence = cut.lastIndexOf("```");
      const trimmed = cut.slice(0, fence).trim();
      if (trimmed) return trimmed;
    }
    return cut.trim();
  }
  return null;
}

export function prBody(title: string, number: number): string {
  return [
    "## Summary",
    `Fixes #${number}`,
    "",
    title.trim(),
    "",
    "## What changed",
    "-",
    "",
    "## How I tested",
    "-",
    "",
    "## Notes",
    "This is my first pull request to this repo. Happy to change the approach.",
  ].join("\n");
}
