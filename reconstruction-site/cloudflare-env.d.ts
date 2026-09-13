declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RECONSTRUCTION_PROVIDER?: string;
    FAL_KEY?: string;
  }
}
