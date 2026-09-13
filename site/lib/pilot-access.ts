import { HttpError } from "./http.ts";

/** Site-specific trusted identity, distinct from a Sites workspace account ID. */
export function requirePilotUser(userId: string, configuredIds?: string): void {
  const approved = (configuredIds ?? "").split(",").map(id => id.trim()).filter(Boolean);
  if (!approved.includes(userId)) {
    throw new HttpError(403, "Photo generation is currently available to the approved pilot account. The sample workbench and local LDraw test bench remain open to everyone.");
  }
}
