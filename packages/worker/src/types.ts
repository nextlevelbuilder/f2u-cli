export interface Env {
  R2_BUCKET: R2Bucket;
  D1_DATABASE: D1Database;
  API_KEY: string;
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
