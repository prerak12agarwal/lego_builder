export class ReconstructionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) { super(message); this.code = code; this.name = "ReconstructionError"; }
}

export class ReconstructionProviderError extends ReconstructionError {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, status?: number, retryable = false) { super(message, "PROVIDER_ERROR"); this.status = status; this.retryable = retryable; this.name = "ReconstructionProviderError"; }
}

export function safeMessage(value: unknown): string {
  const text = typeof value === "string" ? value : "Provider request failed";
  return text.replace(/https?:\/\/[^\s]+/gi, "[provider URL redacted]").replace(/(?:key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 240) || "Provider request failed";
}
