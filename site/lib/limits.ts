export const LIMITS = {
  inputBytes: 10 * 1024 * 1024,
  inputPixels: 40_000_000,
  normalizedBytes: 6 * 1024 * 1024,
  imageEdge: 1024,
  meshBytes: 16 * 1024 * 1024,
  dailyTotal: 20,
  providerMediaSeconds: 86400,
} as const;
export const ACTIVE_STATES = ["submitting", "queued", "generating", "collecting", "unknown"];
export type JobView = {
  id: string; state: string; createdAt: number; updatedAt: number;
  message: string | null; triangles: number | null;
  bounds: { min: number[]; max: number[] } | null;
  appearance: "preserved" | "absent" | "legacy";
};
