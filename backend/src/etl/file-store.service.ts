import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
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

    // Restore metadata from disk on startup (survives server restarts)
    this.restoreFromDisk();

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
    const metaPath = this.getMetaPath(fileId);

    // Write as newline-delimited JSON for streaming reads
    const lines = data.map((row) => JSON.stringify(row));
    writeFileSync(filePath, lines.join('\n'), 'utf-8');

    // TTL: 3 hours for large files, 2 hours for small
    const ttlMs = data.length > 50000 ? 3 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;

    const entry = {
      ...meta,
      totalRows: data.length,
      expiresAt: Date.now() + ttlMs,
    };

    this.metadata.set(fileId, entry);

    // Persist metadata to disk so it survives restarts
    writeFileSync(metaPath, JSON.stringify(entry), 'utf-8');

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
    const metaPath = this.getMetaPath(fileId);
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
      if (existsSync(metaPath)) unlinkSync(metaPath);
    } catch { /* ignore */ }
  }

  private getFilePath(fileId: string): string {
    return join(this.cacheDir, `${fileId}.ndjson`);
  }

  private getMetaPath(fileId: string): string {
    return join(this.cacheDir, `${fileId}.meta.json`);
  }

  /**
   * Restores metadata from disk on startup so files survive server restarts.
   */
  private restoreFromDisk(): void {
    try {
      const files = readdirSync(this.cacheDir);
      const metaFiles = files.filter((f) => f.endsWith('.meta.json'));

      for (const metaFile of metaFiles) {
        const fileId = metaFile.replace('.meta.json', '');
        const dataPath = this.getFilePath(fileId);
        const metaPath = join(this.cacheDir, metaFile);

        // Only restore if the data file also exists
        if (!existsSync(dataPath)) {
          try { unlinkSync(metaPath); } catch { /* ignore */ }
          continue;
        }

        try {
          const raw = readFileSync(metaPath, 'utf-8');
          const entry = JSON.parse(raw);

          // Skip if already expired
          if (Date.now() > entry.expiresAt) {
            try { unlinkSync(dataPath); } catch { /* ignore */ }
            try { unlinkSync(metaPath); } catch { /* ignore */ }
            continue;
          }

          this.metadata.set(fileId, entry);
        } catch {
          // Corrupted meta file, clean up
          try { unlinkSync(metaPath); } catch { /* ignore */ }
        }
      }

      if (this.metadata.size > 0) {
        console.log(`[FileStore] Restored ${this.metadata.size} cached file(s) from disk`);
      }
    } catch { /* ignore - directory might be empty */ }
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
