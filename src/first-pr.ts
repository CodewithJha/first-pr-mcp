import { decodeBase64, gh, ghOptional } from "./github.js";
import {
  branchName,
  daysLabel,
  daysSince,
  extractFiles,
  languageName,
  median,
  parseIssueUrl,
  parseRepo,
  prBody,
  quoteQualifier,
  searchTerms,
  setupExcerpt,
  topicQualifier,
} from "./logic.js";

const RECENT_DAYS = 90;

export interface IssueHit {
  title: string;
  repo: string;
  url: string;
  labels: string[];
  age_days: number;
  comments: number;
}

export interface FindResult {
  query: string;
  widened: boolean;
  issues: IssueHit[];
}

export interface BriefResult {
  repo: string;
  url: string;
  description: string | null;
  stars: number;
  default_branch: string;
  last_push_days: number;
  median_merged_pr_days: number | null;
  has_readme: boolean;
  has_contributing: boolean;
  has_code_of_conduct: boolean;
  setup_excerpt: string | null;
  checklist: string[];
}

export interface PlanResult {
  title: string;
  issue_url: string;
  repo: string;
  base_branch: string;
  branch: string;
  files: string[];
  search_terms: string[];
  steps: string[];
  pr_body: string;
}

interface SearchItem {
  title: string;
  html_url: string;
  repository_url: string;
  comments: number;
  created_at: string;
  labels: { name: string }[];
  assignee: unknown;
  assignees?: unknown[];
  locked?: boolean;
  pull_request?: unknown;
}

interface RepoPayload {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  default_branch: string;
  pushed_at: string;
}

interface ReadmePayload {
  content?: string;
  encoding?: string;
}

interface CommunityPayload {
  files?: {
    readme?: unknown;
    contributing?: unknown;
    code_of_conduct?: unknown;
    code_of_conduct_file?: unknown;
  };
}

interface PullPayload {
  merged_at: string | null;
}

interface IssuePayload {
  title: string;
  html_url: string;
  body: string | null;
  pull_request?: unknown;
}

function repoFromApiUrl(url: string): string {
  const match = url.match(/\/repos\/([^/]+)\/([^/]+)/);
  return match ? `${match[1]}/${match[2]}` : url;
}

// GitHub's issue search returns nothing when a hyphenated label is OR'd with
// a spaced one, so the two labels are queried separately. Good-first-issue
// first: that is the label a new contributor should see before help-wanted.
const LABELS = ['"good first issue"', '"help wanted"'] as const;

function searchQuery(
  language: string,
  topic: string | undefined,
  recent: boolean,
  label: string,
): string {
  const parts = [
    "is:issue",
    "is:open",
    "no:assignee",
    `label:${label}`,
    `language:${quoteQualifier(languageName(language))}`,
  ];
  const topicName = topicQualifier(topic);
  if (topicName) parts.push(`topic:${topicName}`);
  if (recent) {
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    parts.push(`updated:>=${since}`);
  }
  return parts.join(" ");
}

async function searchIssues(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<IssueHit[]> {
  const payload = await gh<{ items: SearchItem[] }>(
    `/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${limit}`,
    signal,
  );
  return payload.items
    .filter(
      (item) =>
        !item.pull_request &&
        !item.locked &&
        !item.assignee &&
        !(item.assignees && item.assignees.length > 0),
    )
    .map((item) => ({
      title: item.title,
      repo: repoFromApiUrl(item.repository_url),
      url: item.html_url,
      labels: item.labels.map((label) => label.name),
      age_days: daysSince(item.created_at),
      comments: item.comments,
    }));
}

async function gather(
  language: string,
  topic: string | undefined,
  limit: number,
  recent: boolean,
  signal?: AbortSignal,
): Promise<{ query: string; issues: IssueHit[] }> {
  const queries: string[] = [];
  const issues: IssueHit[] = [];
  const seen = new Set<string>();
  for (const label of LABELS) {
    const query = searchQuery(language, topic, recent, label);
    queries.push(query);
    const batch = await searchIssues(query, limit - issues.length, signal);
    for (const issue of batch) {
      if (seen.has(issue.url)) continue;
      seen.add(issue.url);
      issues.push(issue);
    }
    if (issues.length >= limit) break;
  }
  return { query: queries.join(" | "), issues: issues.slice(0, limit) };
}

export async function findFirstIssues(
  input: { language: string; topic?: string; limit?: number },
  signal?: AbortSignal,
): Promise<FindResult> {
  const limit = input.limit ?? 5;
  const recent = await gather(input.language, input.topic, limit, true, signal);
  if (recent.issues.length > 0) {
    return { query: recent.query, widened: false, issues: recent.issues };
  }
  const older = await gather(input.language, input.topic, limit, false, signal);
  return { query: recent.query, widened: true, issues: older.issues };
}

export function formatIssues(result: FindResult): string {
  if (result.issues.length === 0) {
    return `No open, unassigned "good first issue" or "help wanted" issues for that search.\nQuery: ${result.query}`;
  }
  const lead = result.widened
    ? `Nothing updated in the last ${RECENT_DAYS} days. These are older open issues.`
    : `Open, unassigned issues updated in the last ${RECENT_DAYS} days.`;
  const lines = result.issues.map((issue, index) =>
    [
      `${index + 1}. ${issue.title}`,
      `   ${issue.repo} · open ${daysLabel(issue.age_days)} · ${issue.comments} comments`,
      `   ${issue.labels.join(", ") || "no labels"}`,
      `   ${issue.url}`,
    ].join("\n"),
  );
  return `${lead}\n\n${lines.join("\n\n")}`;
}

export async function repoOnboardingBrief(
  input: { repo: string },
  signal?: AbortSignal,
): Promise<BriefResult> {
  const { owner, repo } = parseRepo(input.repo);
  const base = `/repos/${owner}/${repo}`;
  const [meta, readme, community, pulls] = await Promise.all([
    gh<RepoPayload>(base, signal),
    ghOptional<ReadmePayload>(`${base}/readme`, signal),
    ghOptional<CommunityPayload>(`${base}/community/profile`, signal),
    gh<PullPayload[]>(
      `${base}/pulls?state=closed&sort=updated&direction=desc&per_page=10`,
      signal,
    ),
  ]);

  const files = community?.files;
  const mergedAges = pulls
    .filter((pull) => pull.merged_at)
    .map((pull) => daysSince(pull.merged_at as string));
  const excerpt =
    readme?.encoding === "base64" && readme.content && readme.content.length < 120_000
      ? setupExcerpt(decodeBase64(readme.content))
      : null;

  const result: BriefResult = {
    repo: meta.full_name,
    url: meta.html_url,
    description: meta.description,
    stars: meta.stargazers_count,
    default_branch: meta.default_branch,
    last_push_days: daysSince(meta.pushed_at),
    median_merged_pr_days: median(mergedAges),
    has_readme: Boolean(files?.readme) || Boolean(readme),
    has_contributing: Boolean(files?.contributing),
    has_code_of_conduct: Boolean(files?.code_of_conduct ?? files?.code_of_conduct_file),
    setup_excerpt: excerpt,
    checklist: [],
  };
  result.checklist = checklist(result);
  return result;
}

function checklist(info: BriefResult): string[] {
  const push = `Last push was ${daysLabel(info.last_push_days)} ago.`;
  const activity =
    info.median_merged_pr_days === null
      ? `${push} None of the 10 most recently updated closed pull requests are merged, so a review may take a while.`
      : `${push} Across the recently updated merged pull requests, the median time since merge is ${daysLabel(info.median_merged_pr_days)}.`;
  const issueQuery = encodeURIComponent(
    'is:issue is:open no:assignee label:"good first issue"',
  );
  return [
    `Clone the repo and start from \`${info.default_branch}\`.`,
    info.has_readme
      ? "Read the README before you change anything."
      : "This repo has no README. If you are new, pick a different one.",
    info.has_contributing
      ? "Follow CONTRIBUTING.md. It beats any guess about their process."
      : "No CONTRIBUTING.md. Keep the change small and match the surrounding code.",
    info.has_code_of_conduct
      ? "Read the code of conduct before you comment."
      : "No code of conduct file. Be polite anyway. You are a guest in their repo.",
    activity,
    `Browse starter issues: ${info.url}/issues?q=${issueQuery}`,
  ];
}

export function formatBrief(info: BriefResult): string {
  const header = [
    `${info.repo} · ${info.stars} stars · default branch ${info.default_branch}`,
    info.description ?? "(no description)",
    "",
    "Checklist:",
    ...info.checklist.map((item) => `- ${item}`),
  ];
  if (info.setup_excerpt) {
    header.push("", "Setup notes from the README:", info.setup_excerpt);
  }
  return header.join("\n");
}

export async function firstPrPlan(
  input: { issue_url: string },
  signal?: AbortSignal,
): Promise<PlanResult> {
  const parsed = parseIssueUrl(input.issue_url);
  const base = `/repos/${parsed.owner}/${parsed.repo}`;
  const [issue, repo] = await Promise.all([
    gh<IssuePayload>(`${base}/issues/${parsed.number}`, signal),
    gh<RepoPayload>(base, signal),
  ]);
  if (issue.pull_request) {
    throw new Error("That URL is a pull request. Pass an issue URL.");
  }

  const text = `${issue.title}\n${issue.body ?? ""}`.slice(0, 8_000);
  const files = extractFiles(text);
  const terms = searchTerms(text);
  const branch = branchName(parsed.number, issue.title);
  const repoName = repo.full_name;
  const where = files.length
    ? `Start with the files named in the issue: ${files.join(", ")}.`
    : `The issue does not name files. Search the repo for: ${terms.join(", ") || "the words in the title"}.`;

  return {
    title: issue.title,
    issue_url: issue.html_url,
    repo: repoName,
    base_branch: repo.default_branch,
    branch,
    files,
    search_terms: terms,
    pr_body: prBody(issue.title, parsed.number),
    steps: [
      `Read the issue once and restate it in one sentence: ${issue.html_url}`,
      `Fork ${repo.html_url} and clone your fork. Add upstream: git remote add upstream ${repo.html_url}.git`,
      `Update ${repo.default_branch}, then create the branch: git checkout -b ${branch}`,
      where,
      "Make the smallest change that addresses the issue. Do not drive-by refactor.",
      `Push the branch and open a pull request into ${repoName}:${repo.default_branch}. Paste the description below. It already contains "Fixes #${parsed.number}".`,
    ],
  };
}

export function formatPlan(plan: PlanResult): string {
  return [
    `${plan.title}`,
    `${plan.repo} → ${plan.base_branch}`,
    `Branch: ${plan.branch}`,
    "",
    "Steps:",
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Pull request description:",
    plan.pr_body,
  ].join("\n");
}
