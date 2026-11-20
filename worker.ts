import server from "./index.js";

interface Env {
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ponytail: one token for the isolate. Per-request tokens if this is ever multi-tenant.
    if (env.GITHUB_TOKEN) process.env.GITHUB_TOKEN = env.GITHUB_TOKEN;
    return server.fetch(request);
  },
};
