import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

// Common MIME types for files AI agents typically upload
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.json': 'application/json',
  '.txt': 'text/plain', '.html': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.ts': 'text/typescript',
  '.csv': 'text/csv', '.xml': 'application/xml',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.tar': 'application/x-tar',
  '.md': 'text/markdown', '.yaml': 'text/yaml', '.yml': 'text/yaml',
  // Audio
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma', '.opus': 'audio/opus',
  // Video (.webm defaults to video — covers both audio/video use)
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4', '.3gp': 'video/3gpp',
};
import type { F2uConfig } from './config.js';

// Response shapes matching Worker API exactly
export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  size: number;
  content_type: string;
  ttl: string;
  ttl_seconds: number;
  expires_at: string;
  created_at: string;
}

export interface FileInfo {
  id: string;
  url: string;
  filename: string;
  size: number;
  content_type: string | null;
  ttl_seconds: number;
  ttl_remaining: number;
  expires_at: string;
  created_at: string;
  deleted: boolean;
  expired: boolean;
}

export interface FilesListResult {
  files: FileInfo[];
  count: number;
}

export interface DeleteResult {
  id: string;
  deleted: boolean;
}

export interface UsageResult {
  active: { files: number; bytes: number };
  all_time: { files: number; bytes: number };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: F2uConfig) {
    this.baseUrl = config.endpoint;
    this.headers = {
      Authorization: `Bearer ${config.api_key}`,
    };
  }

  // Parse response and exit with JSON error on non-ok status
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { message: response.statusText };
      }
      process.stderr.write(
        JSON.stringify({ error: 'API request failed', status: response.status, detail: errorBody }) + '\n',
      );
      process.exit(1);
    }
    return response.json() as Promise<T>;
  }

  async upload(filePath: string, ttl: string): Promise<UploadResult> {
    const fileBuffer = readFileSync(filePath);
    const filename = basename(filePath);
    const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const blob = new Blob([fileBuffer], { type: mimeType });

    const form = new FormData();
    form.append('file', blob, filename);
    form.append('ttl', ttl);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: this.headers,
      body: form,
    });

    return this.handleResponse<UploadResult>(response);
  }

  async listFiles(): Promise<FilesListResult> {
    const response = await fetch(`${this.baseUrl}/files`, {
      headers: this.headers,
    });
    return this.handleResponse<FilesListResult>(response);
  }

  async deleteFile(id: string): Promise<DeleteResult> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    return this.handleResponse<DeleteResult>(response);
  }

  async fileInfo(id: string): Promise<FileInfo> {
    const response = await fetch(`${this.baseUrl}/info/${encodeURIComponent(id)}`, {
      headers: this.headers,
    });
    return this.handleResponse<FileInfo>(response);
  }

  async usage(): Promise<UsageResult> {
    const response = await fetch(`${this.baseUrl}/usage`, {
      headers: this.headers,
    });
    return this.handleResponse<UsageResult>(response);
  }
}
