import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { F2uConfig } from './config.js';

// Response shapes returned by the Worker API
export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  size: number;
  ttl: string;
  expires_at: string;
}

export interface FileInfo {
  id: string;
  url: string;
  filename: string;
  size: number;
  ttl: string;
  expires_at: string;
  ttl_remaining_seconds: number;
}

export interface DeleteResult {
  success: boolean;
  id: string;
}

export interface UsageResult {
  file_count: number;
  total_size_bytes: number;
  total_size_human: string;
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
    const blob = new Blob([fileBuffer]);

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

  async listFiles(): Promise<FileInfo[]> {
    const response = await fetch(`${this.baseUrl}/files`, {
      headers: this.headers,
    });
    return this.handleResponse<FileInfo[]>(response);
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
