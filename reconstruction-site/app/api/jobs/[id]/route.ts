import { authorized } from "@/lib/server";
import { boundary, checkOrigin, json } from "@/lib/http";
import { publicJob } from "@/lib/jobs";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: Context) {
  return boundary(async () => { const { user, jobs } = await authorized(); return json(publicJob(await jobs.get(user.userId, (await context.params).id))); });
}
export async function POST(request: Request, context: Context) {
  return boundary(async () => { checkOrigin(request); const { user, jobs } = await authorized(); return json(publicJob(await jobs.refresh(user.userId, (await context.params).id))); });
}
export async function DELETE(request: Request, context: Context) {
  return boundary(async () => { checkOrigin(request); const { user, jobs } = await authorized(); await jobs.remove(user.userId, (await context.params).id); return json({ deleted: true }); });
}
