import { getChatGPTUser } from "@/app/chatgpt-auth";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Identifies only the current caller. Never accesses model storage or credentials.
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (request.headers.get("accept")?.includes("text/html")) {
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
    const content = user
      ? `<h1>Your workshop account</h1><p>${escape(user.displayName)}</p><p>Account ID: <code>${escape(user.userId)}</code></p><p><a href="/build">Return to your workshop</a></p>`
      : '<h1>Sign in to your workshop</h1><a href="/signin-with-chatgpt?return_to=%2Fapi%2Fsession" target="_top">Sign in with ChatGPT</a>';
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workshop account</title><body style="font:16px/1.6 system-ui;padding:32px;max-width:720px;margin:auto">${content}</body></html>`, {
      status: user ? 200 : 401,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
    });
  }
  return user ? json({ userId: user.userId, displayName: user.displayName }) : json({ error: "Sign in to view your account." }, 401);
}
