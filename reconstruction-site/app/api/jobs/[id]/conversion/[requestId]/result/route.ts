import { authorized } from "@/lib/server";
import { boundary, checkOrigin, HttpError, json, readLimited } from "@/lib/http";
import { CONVERSION_LIMITS, parseConversionResult } from "@/lib/conversion-contract";
import { publicConversion } from "@/lib/conversions";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  return boundary(async () => {
    checkOrigin(request); if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "A JSON conversion result is required.");
    let body: unknown; try { body = JSON.parse(new TextDecoder().decode(await readLimited(request.body, CONVERSION_LIMITS.bodyBytes))); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "The conversion JSON is invalid."); }
    const { user, conversions } = await authorized(), { id, requestId } = await context.params; return json(publicConversion(await conversions.acceptResult(user.userId, id, requestId, parseConversionResult(body))));
  });
}
