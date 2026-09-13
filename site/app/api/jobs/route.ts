import { authorized } from "@/lib/server";
import { boundary, checkOrigin, json, readLimited, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { publicJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return boundary(async () => {
    checkOrigin(request);
    const { user, jobs } = await authorized();
    if (request.headers.get("content-type") !== "image/png") throw new HttpError(415, "A normalized PNG image is required.");
    const bytes = await readLimited(request.body, LIMITS.normalizedBytes);
    const row = await jobs.create(user.userId, request.headers.get("Idempotency-Key") ?? "", bytes);
    return json(publicJob(row), 201);
  });
}
export async function GET(request: Request) {
  return boundary(async () => {
    const { user, jobs } = await authorized();
    const key = new URL(request.url).searchParams.get("request");
    const row = key ? await jobs.findRequest(user.userId, key) : await jobs.latest(user.userId);
    return json(row ? publicJob(row) : null);
  });
}
