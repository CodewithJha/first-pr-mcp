const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function token(): string | undefined {
  const value = process.env.GITHUB_TOKEN;
  return value && value.length > 0 ? value : undefined;
}

export async function gh<T>(path: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "first-pr-mcp",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;

  const response = await fetch(`${API}${path}`, { headers, signal });
  if (response.ok) return (await response.json()) as T;

  let detail = "";
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) detail = `: ${body.message}`;
  } catch {
    // Error bodies are sometimes empty.
  }

  if (
    response.status === 403 &&
    response.headers.get("x-ratelimit-remaining") === "0"
  ) {
    const reset = response.headers.get("x-ratelimit-reset");
    const when = reset
      ? new Date(Number(reset) * 1000).toISOString()
      : "later";
    throw new GitHubError(
      `GitHub rate limit reached. It resets at ${when}. Set GITHUB_TOKEN to raise the limit from 60 requests per hour.`,
      403,
    );
  }

  throw new GitHubError(`GitHub ${response.status} on ${path}${detail}`, response.status);
}

export async function ghOptional<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    return await gh<T>(path, signal);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export function decodeBase64(content: string): string {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
