export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readLimited(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!stream) throw new HttpError(400, "The file is empty.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new HttpError(413, "The file exceeds the supported size.");
      chunks.push(value);
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Open this page again before continuing.");
}

export async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function boundary(action: () => Promise<Response>) {
  try { return await action(); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    // Do not log provider responses, upload bytes, URLs or credentials.
    console.error("reconstruction_request_failed");
    return json({ error: "The service is temporarily unavailable. Your existing job is saved; try again shortly." }, 503);
  }
}
