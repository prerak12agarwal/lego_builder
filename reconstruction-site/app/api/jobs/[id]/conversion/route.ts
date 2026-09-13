import { authorized } from "@/lib/server";
import { boundary, checkOrigin, HttpError, json, readLimited } from "@/lib/http";
import { CONVERSION_LIMITS, parseConversionRequest } from "@/lib/conversion-contract";
import { publicConversion } from "@/lib/conversions";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
async function payload(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "A JSON conversion request is required.");
  try { return JSON.parse(new TextDecoder().decode(await readLimited(request.body, CONVERSION_LIMITS.bodyBytes))) as unknown; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "The conversion JSON is invalid."); }
}
export async function GET(request: Request, context: Context) {
  return boundary(async () => { const { user, conversions } = await authorized(), id = (await context.params).id, query = new URL(request.url).searchParams, key = query.get("request"); const row = key ? await conversions.findRequest(user.userId, id, key) : query.get("result") === "latest" ? await conversions.latestResult(user.userId, id) : await conversions.latest(user.userId, id); return json(row ? publicConversion(row) : null); });
}
export async function POST(request: Request, context: Context) {
  return boundary(async () => { checkOrigin(request); const { user, conversions } = await authorized(); const row = await conversions.create(user.userId, (await context.params).id, request.headers.get("Idempotency-Key") ?? "", parseConversionRequest(await payload(request))); return json(publicConversion(row), 201); });
}
