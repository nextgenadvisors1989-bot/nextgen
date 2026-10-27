/**
 * Storage driver for the document vault.
 *
 * `local` writes to STORAGE_LOCAL_PATH (default ./storage/uploads) and is the
 * only driver wired up in this deployment; the interface is deliberately narrow
 * (write / read / delete / exists) so an S3 or Azure driver can be dropped in
 * behind `getStorage()` without touching the file service.
 *
 * Every stored name is a server-generated UUID plus the validated extension —
 * a user-supplied filename never reaches the filesystem.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';

export interface StoredObject {
  /** Relative path recorded in `files.storage_path`. */
  storagePath: string;
  storedName: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface StorageDriver {
  write(relativeDir: string, storedName: string, data: Buffer): Promise<StoredObject>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH ?? './storage/uploads');

/** Resolve a stored path, refusing anything that escapes the vault root. */
export function absolutePath(storagePath: string): string {
  const resolved = path.resolve(ROOT, storagePath);
  if (resolved !== ROOT && !resolved.startsWith(`${ROOT}${path.sep}`)) {
    throw Object.assign(new Error('Invalid storage path'), { code: 'INVALID_PATH' });
  }
  return resolved;
}

/** `2026/10` style month buckets keep directory listings manageable. */
export function bucketFor(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}/${month}`;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Sanitised, deduplicated, server-owned filename. */
export function buildStoredName(originalName: string, extension: string | null): string {
  const ext = extension ? `.${extension.replace(/[^a-z0-9]/gi, '').toLowerCase()}` : '';
  const stem = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file';
  return `${Date.now()}-${stem}-${randomUUID().slice(0, 8)}${ext}`;
}

const localDriver: StorageDriver = {
  async write(relativeDir, storedName, data) {
    const dir = path.join(ROOT, relativeDir);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, storedName);
    await writeFile(target, data);
    return {
      storagePath: path.posix.join(relativeDir, storedName),
      storedName,
      sizeBytes: data.length,
      checksumSha256: sha256(data),
    };
  },
  read: (storagePath) => readFile(absolutePath(storagePath)),
  async delete(storagePath) {
    try {
      await unlink(absolutePath(storagePath));
    } catch (error) {
      // A missing blob is not an error: the metadata row is the source of truth.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  },
  async exists(storagePath) {
    try {
      await access(absolutePath(storagePath));
      return true;
    } catch {
      return false;
    }
  },
};

export function getStorage(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'local') return localDriver;
  throw new Error(`Storage driver "${driver}" is not configured for this deployment`);
}

export async function storageRootExists(): Promise<boolean> {
  try {
    const info = await stat(ROOT);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export { ROOT as STORAGE_ROOT };
