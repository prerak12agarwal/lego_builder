import { authorized } from "@/lib/server";
import { boundary } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
  return boundary(async () => { const { user, jobs } = await authorized(); const { id, kind } = await context.params; return jobs.artifact(user.userId, id, kind); });
}
