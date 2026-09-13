import { authorized } from "@/lib/server";
import { boundary } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  return boundary(async () => { const { user, conversions } = await authorized(); const { id, requestId } = await context.params; return conversions.artifact(user.userId, id, requestId); });
}
