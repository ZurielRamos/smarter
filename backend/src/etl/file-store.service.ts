import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * File store that persists parsed file data to disk instead of holding it in RAM.
 * 
 * For 500K rows × 10 cols ≈ 200MB in memory vs ~50MB compressed on disk.
 * This frees Node.js heap for actual processing.
 * 
 * Files are stored in /tmp/etl-cache/ with auto-cleanup TTL.
 */
export interface StoredFile {
  headers: string[];
  fileName: string;
  fileSize: number;
  fileType: string;
  totalRows: number;
}

@Injectable()
export class FileStoreService implements OnModuleDestroy {
  private readonly cacheDir: string;
  private readonly metadata = new Map<string, StoredFile & { expiresAt: number }>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private readonly config: ConfigService) {
    this.cacheDir = config.get<string>('ETL_CACHE_DIR', '/tmp/etl-cache');
    mkdirSync(this.cacheDir, { recursive: true });

    // Cleanup expired files every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  /**
   * Stores parsed file data to disk and returns a fileId.
   */
  store(data: Record<string, string>[], meta: Omit<StoredFile, 'totalRows'>): string {
    const fileId = uuidv4();
    const filePath = this.getFilePath(fileId);

    // Write as newline-delimited JSON for streaming reads
    const lines = data.map((row) => JSON.stringify(row));
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    // TTL: 30 min for large files, 60 min for small
    const ttlMs = data.length > 50000 ? 30 * 60 * 1000 : 60 * 60 * 1000;

    this.metadata.set(fileId, {
      ...meta,
      totalRows: data.length,
      expiresAt: Date.now() + ttlMs,
    });

    return fileId;
  }

  /**
   * Gets metadata without loading the full data.
   */
  getMeta(fileId: string): StoredFile | null {
    const entry = this.metadata.get(fileId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.delete(fileId);
      return null;
    }
    const { expiresAt, ...meta } = entry;
    return meta;
  }

  /**
   * Checks if a file exists and is not expired.
   */
  exists(fileId: string): boolean {
    return this.getMeta(fileId) !== null;
  }

  /**
   * Reads a slice of rows from disk. Efficient for preview (first N rows).
   */
  readSlice(fileId: string, start: number, count: number): Record<string, string>[] {
    const filePath = this.getFilePath(fileId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const end = Math.min(start + count, lines.length);
    const results: Record<string, string>[] = [];

    for (let i = start; i < end; i++) {
      if (lines[i]) {
        results.push(JSON.parse(lines[i]));
      }
    }

    return results;
  }

  /**
   * Reads ALL rows from disk. Use for processing, not for preview.
   * For very large files, prefer readChunked().
   */
  readAll(fileId: string): Record<string, string>[] {
    const filePath = this.getFilePath(fileId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, 'utf-8');
    return content.split('\n').filter((l) => l).map((line) => JSON.parse(line));
  }

  /**
   * Processes file in chunks to avoid loading everything into RAM.
   * Calls the processor function for each chunk.
   */
  async processChunked<T>(
    fileId: string,
    chunkSize: number,
    processor: (chunk: Record<string, string>[], chunkIndex: number) => Promise<T>,
  ): Promise<T[]> {
    const filePath = this.getFilePath(fileId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l);
    const results: T[] = [];

    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunkLines = lines.slice(i, i + chunkSize);
      const chunk = chunkLines.map((line) => JSON.parse(line));
      const result = await processor(chunk, Math.floor(i / chunkSize));
      results.push(result);
    }

    return results;
  }

  /**
   * Deletes a cached file.
   */
  delete(fileId: string): void {
    this.metadata.delete(fileId);
    const filePath = this.getFilePath(fileId);
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch { /* ignore */ }
  }

  private getFilePath(fileId: string): string {
    return join(this.cacheDir, `${fileId}.ndjson`);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [fileId, meta] of this.metadata.entries()) {
      if (now > meta.expiresAt) {
        this.delete(fileId);
      }
    }
  }
}
