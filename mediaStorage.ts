/**
 * Persistent local storage for binary media (images and audio) using native IndexedDB.
 * Text notes and metadata are stored in localStorage; binary blobs are kept in IndexedDB
 * keyed by note ID.
 */

const DB_NAME = 'notecraft_db'
const DB_VERSION = 2

export const STORES = {
  IMAGES: 'note_images',
  AUDIO: 'note_audio',
} as const

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

let dbPromise: Promise<IDBDatabase> | null = null
let cachedDb: IDBDatabase | null = null

/**
 * Resets the cached IndexedDB connection and pending Promise.
 * Safely closes the active connection if still open.
 */
export function resetDBCache(): void {
  if (cachedDb) {
    try {
      cachedDb.close()
    } catch {
      // Ignore close errors
    }
    cachedDb = null
  }
  dbPromise = null
}

/**
 * Retrieves a shared, cached IDBDatabase connection.
 * Concurrent callers share the same open Promise, and subsequent calls reuse the open connection.
 */
export function getDB(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not supported or not available in this environment.'))
  }

  // 1. Return healthy open connection if available
  if (cachedDb) {
    return Promise.resolve(cachedDb)
  }

  // 2. Share pending open request if one is in flight
  if (dbPromise) {
    return dbPromise
  }

  // 3. Initiate single database open request
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      dbPromise = null
      reject(err)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        db.createObjectStore(STORES.IMAGES)
      }

      if (!db.objectStoreNames.contains(STORES.AUDIO)) {
        db.createObjectStore(STORES.AUDIO)
      }
    }

    request.onsuccess = () => {
      const db = request.result
      cachedDb = db

      // Handle versionchange event requested by another tab or script
      db.onversionchange = () => {
        console.warn('[mediaStorage] IndexedDB version change requested. Closing cached connection.')
        resetDBCache()
      }

      // Handle unexpected connection closure
      db.onclose = () => {
        resetDBCache()
      }

      db.onerror = (e) => {
        console.warn('[mediaStorage] Unexpected IndexedDB connection error:', e)
      }

      resolve(db)
    }

    request.onerror = () => {
      const err = request.error || new Error('Failed to open IndexedDB.')
      resetDBCache()
      reject(err)
    }

    request.onblocked = () => {
      console.warn('[mediaStorage] IndexedDB open blocked by an existing open connection.')
    }
  }).catch((err) => {
    // Prevent stale or permanently rejected cached Promise
    resetDBCache()
    throw err
  })

  return dbPromise
}

// ----------------- Image Storage -----------------

export async function saveNoteImage(noteId: string, blob: Blob): Promise<void> {
  if (!noteId || !(blob instanceof Blob)) return
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IMAGES, 'readwrite')
      tx.objectStore(STORES.IMAGES).put(blob, noteId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'))
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to save image for note "${noteId}":`, err)
  }
}

export async function getNoteImage(noteId: string): Promise<Blob | null> {
  if (!noteId) return null
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IMAGES, 'readonly')
      const request = tx.objectStore(STORES.IMAGES).get(noteId)
      request.onsuccess = () => {
        const result = request.result
        resolve(result instanceof Blob ? result : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to retrieve image for note "${noteId}":`, err)
    return null
  }
}

/**
 * Batch retrieves images for multiple note IDs within a single read transaction.
 */
export async function getNoteImages(noteIds: string[]): Promise<Map<string, Blob>> {
  const result = new Map<string, Blob>()
  const validIds = Array.from(new Set(noteIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
  if (validIds.length === 0) return result

  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.IMAGES, 'readonly')
      const store = tx.objectStore(STORES.IMAGES)
      let pending = validIds.length

      for (const id of validIds) {
        const req = store.get(id)
        req.onsuccess = () => {
          if (req.result instanceof Blob) {
            result.set(id, req.result)
          }
          if (--pending === 0) resolve(result)
        }
        req.onerror = () => {
          if (--pending === 0) resolve(result)
        }
      }

      tx.onerror = () => resolve(result)
      tx.onabort = () => resolve(result)
    })
  } catch (err) {
    console.warn('[mediaStorage] Failed in batch image retrieval:', err)
    return result
  }
}

export async function deleteNoteImage(noteId: string): Promise<void> {
  if (!noteId) return
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.IMAGES, 'readwrite')
      tx.objectStore(STORES.IMAGES).delete(noteId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to delete image for note "${noteId}":`, err)
  }
}

// ----------------- Audio Storage -----------------

export async function saveNoteAudio(noteId: string, blob: Blob): Promise<void> {
  if (!noteId || !(blob instanceof Blob)) return
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUDIO, 'readwrite')
      tx.objectStore(STORES.AUDIO).put(blob, noteId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'))
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to save audio for note "${noteId}":`, err)
  }
}

export async function getNoteAudio(noteId: string): Promise<Blob | null> {
  if (!noteId) return null
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUDIO, 'readonly')
      const request = tx.objectStore(STORES.AUDIO).get(noteId)
      request.onsuccess = () => {
        const result = request.result
        resolve(result instanceof Blob ? result : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to retrieve audio for note "${noteId}":`, err)
    return null
  }
}

/**
 * Batch retrieves audio files for multiple note IDs within a single read transaction.
 */
export async function getNoteAudios(noteIds: string[]): Promise<Map<string, Blob>> {
  const result = new Map<string, Blob>()
  const validIds = Array.from(new Set(noteIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
  if (validIds.length === 0) return result

  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.AUDIO, 'readonly')
      const store = tx.objectStore(STORES.AUDIO)
      let pending = validIds.length

      for (const id of validIds) {
        const req = store.get(id)
        req.onsuccess = () => {
          if (req.result instanceof Blob) {
            result.set(id, req.result)
          }
          if (--pending === 0) resolve(result)
        }
        req.onerror = () => {
          if (--pending === 0) resolve(result)
        }
      }

      tx.onerror = () => resolve(result)
      tx.onabort = () => resolve(result)
    })
  } catch (err) {
    console.warn('[mediaStorage] Failed in batch audio retrieval:', err)
    return result
  }
}

export async function deleteNoteAudio(noteId: string): Promise<void> {
  if (!noteId) return
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.AUDIO, 'readwrite')
      tx.objectStore(STORES.AUDIO).delete(noteId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to delete audio for note "${noteId}":`, err)
  }
}

// ----------------- Multi-Item Cleanup Helpers -----------------

/**
 * Deletes both image and audio for a single note in an atomic transaction across both stores.
 */
export async function deleteNoteMedia(noteId: string): Promise<void> {
  if (!noteId) return
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.IMAGES, STORES.AUDIO], 'readwrite')
      tx.objectStore(STORES.IMAGES).delete(noteId)
      tx.objectStore(STORES.AUDIO).delete(noteId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch (err) {
    console.warn(`[mediaStorage] Failed to delete media for note "${noteId}":`, err)
  }
}

/**
 * Deletes media for multiple note IDs in a single atomic transaction.
 */
export async function deleteNotesMedia(noteIds: string[]): Promise<void> {
  const validIds = Array.from(new Set(noteIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
  if (validIds.length === 0) return

  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.IMAGES, STORES.AUDIO], 'readwrite')
      const imgStore = tx.objectStore(STORES.IMAGES)
      const audioStore = tx.objectStore(STORES.AUDIO)

      for (const id of validIds) {
        imgStore.delete(id)
        audioStore.delete(id)
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch (err) {
    console.warn('[mediaStorage] Failed in batch media deletion:', err)
  }
}
