import { authorized } from "@/lib/server";
import { boundary, checkOrigin, HttpError, json, readLimited } from "@/lib/http";
import { publicConversion } from "@/lib/conversions";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  return boundary(async () => {
    checkOrigin(request);
    const { user, conversions } = await authorized();
    const body = await readLimited(request.body ?? new Response("").body, 1024);
    if (body.length) throw new HttpError(400, "The run endpoint uses only its saved request; do not send URLs or settings.");
    const { id, requestId } = await context.params;
    return json(publicConversion(await conversions.run(user.userId, id, requestId)));
  });
}
