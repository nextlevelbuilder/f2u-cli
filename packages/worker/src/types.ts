export interface Env {
  R2_BUCKET: R2Bucket;
  D1_DATABASE: D1Database;
  API_KEY?: string; // legacy single-key fallback; D1 api_keys table is preferred
  // GitHub OAuth + dashboard
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ADMIN_GITHUB_USERS?: string; // comma-separated GitHub logins; empty = open
  BASE_URL?: string; // e.g. https://f2u.goclaw.sh — overrides URL inference
}

export interface FileRecord {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  r2_key: string;
  url: string;
  ttl_seconds: number;
  expires_at: string;
  created_at: string;
  deleted: number;
}
