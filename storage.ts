import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Base directory for local-first storage
const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../uploads')

if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true })
}

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

export const ALLOWED_AUDIO_MIMES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
  'audio/aac',
]

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024 // 25MB

export interface StorageResult {
  key: string
  sizeBytes: number
}

export interface FileData {
  buffer: Buffer
  mimeType: string
  sizeBytes: number
}

/**
 * StorageProvider Interface
 * Modular storage abstraction ensuring clean separation of concerns.
 * Future cloud object-storage providers (R2, S3, GCS) can implement this
 * interface without changing backend routes, models, or clients.
 */
export interface StorageProvider {
  save(key: string, buffer: Buffer, mimeType?: string): Promise<StorageResult>
  get(key: string): Promise<FileData | null>
  delete(key: string): Promise<boolean>
  isCloud(): boolean
}

export function getSafeExtensionForMime(mimeType: string, kind: 'image' | 'audio'): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'audio/webm':
      return '.webm'
    case 'audio/mp4':
      return '.mp4'
    case 'audio/ogg':
      return '.ogg'
    case 'audio/wav':
      return '.wav'
    case 'audio/mpeg':
      return '.mp3'
    case 'audio/aac':
      return '.aac'
    default:
      return kind === 'image' ? '.png' : '.webm'
  }
}

function resolveSafePath(key: string): string {
  if (typeof key !== 'string' || key.includes('\0')) {
    throw new Error('Access denied: Invalid storage key.')
  }
  const safeKey = key.replace(/\\/g, '/').replace(/\.\./g, '').replace(/^\/+/, '')
  const fullPath = path.resolve(LOCAL_STORAGE_DIR, safeKey)
  if (fullPath !== LOCAL_STORAGE_DIR && !fullPath.startsWith(LOCAL_STORAGE_DIR + path.sep)) {
    throw new Error('Access denied: Invalid storage key path traversal.')
  }
  return fullPath
}

/**
 * LocalStorageProvider
 * Default storage implementation for local-first architecture (Option B).
 * Safely persists media on disk with strict path traversal prevention.
 */
export class LocalStorageProvider implements StorageProvider {
  isCloud(): boolean {
    return false
  }

  async save(key: string, buffer: Buffer): Promise<StorageResult> {
    const filePath = resolveSafePath(key)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    await fs.promises.writeFile(filePath, buffer)
    return {
      key,
      sizeBytes: buffer.length,
    }
  }

  async get(key: string): Promise<FileData | null> {
    try {
      const filePath = resolveSafePath(key)
      if (!fs.existsSync(filePath)) {
        return null
      }
      const buffer = await fs.promises.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'application/octet-stream'
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
      else if (ext === '.png') mimeType = 'image/png'
      else if (ext === '.webp') mimeType = 'image/webp'
      else if (ext === '.gif') mimeType = 'image/gif'
      else if (ext === '.webm') mimeType = 'audio/webm'
      else if (ext === '.mp4') mimeType = 'audio/mp4'
      else if (ext === '.ogg') mimeType = 'audio/ogg'
      else if (ext === '.wav') mimeType = 'audio/wav'
      else if (ext === '.mp3') mimeType = 'audio/mpeg'

      return {
        buffer,
        mimeType,
        sizeBytes: buffer.length,
      }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const filePath = resolveSafePath(key)
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath)
        return true
      }
      return false
    } catch {
      return false
    }
  }
}

export function initializeStorage(): StorageProvider {
  console.log('[Storage] Local-first media storage active (Option B). No paid cloud storage required.')
  return new LocalStorageProvider()
}

export const storage: StorageProvider = initializeStorage()

export function isCloudStorageActive(): boolean {
  return storage.isCloud()
}
