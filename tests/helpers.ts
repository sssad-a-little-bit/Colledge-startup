import { readFileSync } from "node:fs";
const configuredBaseURL = process.env.PORTAL_BASE_URL || process.env.BASE_URL;
export const baseURL = /^https?:\/\//.test(configuredBaseURL || "")
  ? configuredBaseURL!
  : "http://localhost:3000";
export function demoPassword(): string {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  const text = readFileSync(".demo-credentials", "utf8");
  try {
    const data = JSON.parse(text);
    return data.password || data.accounts?.[0]?.password;
  } catch {
    /* local text file */
  }
  const match = text.match(
    /(?:Пароль[^\n:]*|Password|password)\s*[:=]\s*(\S+)/i,
  );
  if (!match)
    throw new Error(
      "Set DEMO_PASSWORD to the password in local .demo-credentials",
    );
  return match[1];
}
export class ApiClient {
  private cookies = new Map<string, string>();
  constructor(public email = "") {}
  async fetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Origin", baseURL);
    if (this.cookies.size)
      headers.set(
        "Cookie",
        Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; "),
      );
    const response = await fetch(new URL(path, baseURL), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";", 1)[0],
        index = first.indexOf("=");
      this.cookies.set(first.slice(0, index), first.slice(index + 1));
    }
    return response;
  }
  async login(email = this.email, password = demoPassword()) {
    this.email = email;
    const csrfResponse = await this.fetch("/api/auth/csrf");
    const { csrfToken } = await csrfResponse.json();
    const res = await this.fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email,
        password,
        csrfToken,
        callbackUrl: baseURL + "/campus",
        json: "true",
      }),
    });
    if (!res.ok) throw new Error(`Login failed HTTP ${res.status}`);
    const session = await (await this.fetch("/api/auth/session")).json();
    if (!session.user?.id)
      throw new Error(`Login failed for synthetic account ${email}`);
    return this;
  }
  async get(resource: string, query = "") {
    return this.fetch("/api/portal?resource=" + resource + query);
  }
  async post(data: unknown, path = "/api/portal") {
    return this.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }
  cookieHeader() {
    return Array.from(this.cookies, ([k, v]) => `${k}=${v}`).join("; ");
  }
}
