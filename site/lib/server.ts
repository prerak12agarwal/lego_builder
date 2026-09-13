import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { Jobs } from "./jobs";
import { Conversions } from "./conversions";
import { HttpError } from "./http";

export async function authorized() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "Sign in to generate and view your models.");
  if (!env.DB || !env.BUCKET) throw new HttpError(503, "Model storage is not available yet. Try again shortly.");
  return { user, jobs: new Jobs({ DB: env.DB, BUCKET: env.BUCKET, FAL_KEY: env.FAL_KEY, RECONSTRUCTION_PROVIDER: env.RECONSTRUCTION_PROVIDER }), conversions: new Conversions({ DB: env.DB, BUCKET: env.BUCKET, CONVERTER_URL: env.CONVERTER_URL, CONVERTER_TOKEN: env.CONVERTER_TOKEN }) };
}
