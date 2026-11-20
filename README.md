# first-pr-mcp

An MCP server for the part of open source a first-timer gets stuck on: which issue is actually free, whether anyone is still merging, and what to type next.

Built with the [mcp-use](https://github.com/mcp-use/mcp-use) server SDK. It calls the public GitHub REST API. No key and no paid service.

## Why

I run developer communities and Hacktoberfest events in Lucknow. The people who show up can write code. They stall in the GitHub UI. The mentoring in the room is the same every time: search "good first issue", open the repo, see if maintainers are still merging, name a branch, draft the pull request. This server lets Claude, ChatGPT, or Cursor do that lookup, so a mentor can spend the evening on the code.

## Tools

The server reads GitHub and hands back a plan. Forking, pushing, and opening the pull request stay with the person.

| Tool | Input | What you get back |
| --- | --- | --- |
| `find_first_issues` | `language`, optional `topic`, `limit` (1–10, default 5) | Open, unassigned issues labeled **good first issue**, then **help wanted** if that is not enough. Prefer issues updated in the last 90 days. Each hit has title, repo, url, labels, age in days, and comment count. |
| `repo_onboarding_brief` | `owner/name` or a GitHub URL | Whether README, CONTRIBUTING, and a code of conduct exist. Default branch, stars, days since the last push, median age of the recently merged pull requests, a checklist, and the setup section when the README has one. |
| `first_pr_plan` | An issue URL | Steps for fork and branch, a branch name, files the issue text names (or search terms if it names none), and a pull request description that includes `Fixes #n`. |

A `mentor` prompt tells the model to call those tools and not write the patch. A `guide://meetup-checklist` resource is the one-page version handed out at a meetup.

GitHub's search returns nothing if a hyphenated label is OR'd with a spaced one, so the two labels are queried separately, good first issue first. If nothing in that language was updated in 90 days, the tool asks again without the date and says so.

## Example

Someone at a meetup, TypeScript, a few hours. This is a real response from the public API, trimmed.

> I write TypeScript and I have a few hours. Find something small, then tell me if the repo is worth the evening.

`find_first_issues` with `{ "language": "TypeScript", "limit": 2 }`:

```text
Open, unassigned issues updated in the last 90 days.

1. Add a test for the admin force flag rejection path
   hman38705/socialflow-ai-dashboard · open 0 days · 2 comments
   bug, documentation, enhancement, good first issue, …
   https://github.com/hman38705/socialflow-ai-dashboard/issues/2067
```

`repo_onboarding_brief` on `hman38705/socialflow-ai-dashboard`:

```text
hman38705/socialflow-ai-dashboard · 4 stars · default branch master

Checklist:
- Clone the repo and start from `master`.
- Read the README before you change anything.
- Follow CONTRIBUTING.md. It beats any guess about their process.
- No code of conduct file. Be polite anyway. You are a guest in their repo.
- Last push was 8 days ago. Across the recently updated merged pull requests, the median time since merge is 23 days.
```

Four stars and a three-week merge lag: fine for a test, not something to count on being reviewed before everyone goes home. `first_pr_plan` on that issue:

```text
Branch: first-pr/2067-add-a-test-for-the-admin-force-flag-reje

1. Read the issue once and restate it in one sentence.
2. Fork, clone, and add the original repo as upstream.
3. git checkout -b first-pr/2067-add-a-test-for-the-admin-force-flag-reje
4. Start with the files named in the issue:
   backend/src/__tests__/adminRoutes.test.ts
   backend/src/__tests__/validate.test.ts
   backend/src/admin/migrationService.ts
5. Smallest change. No drive-by refactor.
6. Open the pull request into master. The drafted body already says Fixes #2067.
```

`bash scripts/exercise.sh` repeats all three tools, the mentor prompt, and the checklist against a running `npm run dev`.

## Quickstart

Node.js 22.22.2 or newer.

```bash
npm install
npm test
npm run dev
```

- MCP endpoint: `http://localhost:3000/mcp`
- Inspector: `http://localhost:3000/mcp/inspector`

`npm test` covers the parsers (repo URLs, branch names, files pulled out of an issue). `npm run typecheck` is `mcp-use typecheck`.

Unauthenticated GitHub allows 60 requests an hour. For a meetup, copy `.env.example` to `.env` and set `GITHUB_TOKEN`. A fine-grained token with public read access is enough. `mcp-use dev` loads `.env`.

## Connect a client

**Inspector.** `npm run dev` serves it at `http://localhost:3000/mcp/inspector`. Open Tools and run `find_first_issues`.

**Terminal.**

```bash
npx mcp-use client connect local http://localhost:3000/mcp
npx mcp-use client local tools list
npx mcp-use client local tools call find_first_issues language=TypeScript limit:=2
npx mcp-use client local resources read guide://meetup-checklist
```

**Cursor.** Settings → MCP → add a remote server, or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "first-pr": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**Claude Desktop.** Settings → Connectors → Add custom connector. Use `http://localhost:3000/mcp` while developing, or the deployed `https://…/mcp` URL. The same `url` field works in `claude_desktop_config.json` under `mcpServers`.

Point the URL at the deployed Worker when the laptop running `npm run dev` is not the one in the room.

## Deploy

Cloudflare Workers is the target. mcp-use exposes `server.fetch`, and the package has a `workerd` export, so `worker.ts` is a Worker entry. `wrangler deploy --dry-run` bundles it (about 430 KB gzipped). Nothing here was deployed. That needs your Cloudflare login.

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` is `wrangler deploy`. The endpoint will be:

```text
https://first-pr-mcp.<your-account>.workers.dev/mcp
```

Optional, so a room does not share the unauthenticated rate limit:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Manufact Cloud, mcp-use's own host, is the other one-command path. It needs a Manufact login (`npx mcp-use login`), which this repo does not have:

```bash
npm run deploy:manufact
```

Any Node host, after `npm run build`:

```bash
HOST=0.0.0.0 npm start
```

The process listens on port 3000 unless `PORT` is set. Put `MCP_URL` on the public origin when a proxy terminates TLS.

## License

MIT. Priyanshu Jha, [github.com/CodewithJha](https://github.com/CodewithJha).
