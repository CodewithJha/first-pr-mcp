import { MCPServer } from "mcp-use";
import { z } from "zod";
import {
  findFirstIssues,
  firstPrPlan,
  formatBrief,
  formatIssues,
  formatPlan,
  repoOnboardingBrief,
} from "./src/first-pr.js";

const server = new MCPServer({
  name: "first-pr-mcp",
  title: "First PR",
  version: "1.0.0",
  description:
    "Find a good first issue, check the repo is alive, and leave with a branch name and a pull request description.",
  websiteUrl: "https://github.com/CodewithJha/first-pr-mcp",
  instructions:
    "Help a first-time open source contributor. Call find_first_issues, then repo_onboarding_brief on a repo they like, then first_pr_plan on the issue they pick. Explain each step. Do not write the patch.",
});

const issueHit = z.object({
  title: z.string(),
  repo: z.string(),
  url: z.string(),
  labels: z.array(z.string()),
  age_days: z.number().int(),
  comments: z.number().int(),
});

const findSchema = z.object({
  query: z.string(),
  widened: z.boolean(),
  issues: z.array(issueHit),
});

const briefSchema = z.object({
  repo: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  stars: z.number().int(),
  default_branch: z.string(),
  last_push_days: z.number().int(),
  median_merged_pr_days: z.number().int().nullable(),
  has_readme: z.boolean(),
  has_contributing: z.boolean(),
  has_code_of_conduct: z.boolean(),
  setup_excerpt: z.string().nullable(),
  checklist: z.array(z.string()),
});

const planSchema = z.object({
  title: z.string(),
  issue_url: z.string(),
  repo: z.string(),
  base_branch: z.string(),
  branch: z.string(),
  files: z.array(z.string()),
  search_terms: z.array(z.string()),
  steps: z.array(z.string()),
  pr_body: z.string(),
});

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

server.tool(
  {
    name: "find_first_issues",
    title: "Find first issues",
    description:
      "Search GitHub for open, unassigned issues labeled good first issue or help wanted, updated in the last 90 days. Returns title, repo, url, labels, age in days, and comment count.",
    inputSchema: z.object({
      language: z
        .string()
        .describe("GitHub language, such as TypeScript, Python, or Go"),
      topic: z
        .string()
        .optional()
        .describe("Optional repository topic, such as react or cli"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("How many issues to return, 1 to 10"),
    }),
    outputSchema: findSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ language, topic, limit }, ctx) => {
    try {
      const data = await findFirstIssues({ language, topic, limit }, ctx.signal);
      return {
        content: [{ type: "text", text: formatIssues(data) }],
        structuredContent: data,
      };
    } catch (error) {
      return fail(error);
    }
  },
);

server.tool(
  {
    name: "repo_onboarding_brief",
    title: "Repo onboarding brief",
    description:
      "Summarize a GitHub repo for a first-time contributor: README, CONTRIBUTING, and code of conduct, default branch, stars, last push, and the median age of recently merged pull requests. Includes a short checklist.",
    inputSchema: z.object({
      repo: z
        .string()
        .describe("owner/name or https://github.com/owner/name"),
    }),
    outputSchema: briefSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ repo }, ctx) => {
    try {
      const data = await repoOnboardingBrief({ repo }, ctx.signal);
      return {
        content: [{ type: "text", text: formatBrief(data) }],
        structuredContent: data,
      };
    } catch (error) {
      return fail(error);
    }
  },
);

server.tool(
  {
    name: "first_pr_plan",
    title: "First PR plan",
    description:
      "Given a GitHub issue URL, return a first-contribution plan: fork, a branch name, files mentioned in the issue, and a pull request description that closes the issue.",
    inputSchema: z.object({
      issue_url: z
        .string()
        .describe("https://github.com/owner/repo/issues/123"),
    }),
    outputSchema: planSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async ({ issue_url }, ctx) => {
    try {
      const data = await firstPrPlan({ issue_url }, ctx.signal);
      return {
        content: [{ type: "text", text: formatPlan(data) }],
        structuredContent: data,
      };
    } catch (error) {
      return fail(error);
    }
  },
);

server.prompt(
  {
    name: "mentor",
    description:
      "Coach a first-time contributor through one issue. Tells the model to use the tools and not write the patch.",
    schema: z.object({
      issue_url: z.string().describe("Issue to work through"),
      language: z
        .string()
        .optional()
        .describe("Language they want to contribute in"),
    }),
  },
  async ({ issue_url, language }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "You are mentoring someone at a first-contribution meetup in Lucknow.",
            language
              ? `They want to contribute in ${language}.`
              : "They are new to open source.",
            `Issue: ${issue_url}`,
            "",
            "Call first_pr_plan on that URL, then repo_onboarding_brief on the repo.",
            "Walk them through the plan one step at a time, in plain language.",
            "Point at the files the plan names and ask what they think should change.",
            "Do not write the code. After each step, stop and ask a question.",
          ].join("\n"),
        },
      },
    ],
  }),
);

server.resource(
  {
    name: "meetup-checklist",
    uri: "guide://meetup-checklist",
    description:
      "One-page checklist for a first-time contributor at a Lucknow meetup.",
    mimeType: "text/markdown",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/markdown",
        text: [
          "# First contribution",
          "",
          "Use this when someone has an account, git, and an hour.",
          "",
          "1. Pick a language you already write. Do not learn a framework and open source on the same evening.",
          "2. Call find_first_issues. Skip issues with a long argument in the comments.",
          "3. Call repo_onboarding_brief. If the last push was months ago and nothing was merged, choose another repo.",
          "4. Read the issue, then CONTRIBUTING, then the code around the files the plan names.",
          "5. Fork, branch with the suggested name, and change only what the issue asks.",
          "6. Open the pull request with the drafted description. Then leave the tab alone.",
          "",
          "A review can take days. That is normal. Say so before they go home.",
        ].join("\n"),
      },
    ],
  }),
);

export default server;
