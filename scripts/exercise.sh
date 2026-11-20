#!/usr/bin/env bash
# Call every tool, the mentor prompt, and the checklist resource.
# The dev server must already be running: npm run dev
set -euo pipefail

url="${1:-http://localhost:3000/mcp}"
npx mcp-use client remove local >/dev/null 2>&1 || true
npx mcp-use client connect local "$url" --no-oauth --json >/dev/null

echo "===== tools/list ====="
npx mcp-use client local tools list --json

echo "===== find_first_issues ====="
found="$(npx mcp-use client local tools call find_first_issues '{"language":"TypeScript","limit":2}' --json)"
printf '%s\n' "$found"

issue_url="$(printf '%s' "$found" | node --input-type=module -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const issue=j.structuredContent?.issues?.[0]; if(!issue) process.exit(1); process.stdout.write(issue.url+"\n"+issue.repo);})')"
issue="$(printf '%s' "$issue_url" | head -n 1)"
repo="$(printf '%s' "$issue_url" | tail -n 1)"

echo "===== repo_onboarding_brief ($repo) ====="
npx mcp-use client local tools call repo_onboarding_brief "{\"repo\":\"$repo\"}" --json

echo "===== first_pr_plan ($issue) ====="
npx mcp-use client local tools call first_pr_plan "{\"issue_url\":\"$issue\"}" --json

echo "===== mentor prompt ====="
npx mcp-use client local prompts get mentor "{\"issue_url\":\"$issue\"}" --json

echo "===== meetup checklist ====="
npx mcp-use client local resources read "guide://meetup-checklist" --json
