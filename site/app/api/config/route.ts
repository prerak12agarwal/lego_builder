import { authorized } from "@/lib/server";
import { boundary, json } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { publicJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export async function GET() {
  return boundary(async () => {
    const { user, jobs, conversions } = await authorized();
    const latest = await jobs.latest(user.userId);
    const ready = await jobs.latestReady(user.userId);
    return json({ configured: jobs.configured(), converterConfigured: conversions.configured(), limits: LIMITS, latest: latest ? publicJob(latest) : null, latestReady: ready ? publicJob(ready) : null });
  });
}
