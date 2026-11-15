/**
 * NOTECRAFT Phase 2: IndexedDB Performance Benchmark & Test Suite
 * Conforms to W3C IndexedDB interface specifications.
 */

// Simulated realistic W3C IDB implementation for Node.js benchmarking
class MockIDBRequest {
  onsuccess: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  result: any = null
  error: any = null

  _resolve(val: any) {
    this.result = val
    // Realistic async tick
    setTimeout(() => {
      if (this.onsuccess) this.onsuccess({ target: this })
    }, 1)
  }

  _reject(err: any) {
    this.error = err
    setTimeout(() => {
      if (this.onerror) this.onerror({ target: this })
    }, 1)
  }
}

class MockIDBOpenRequest extends MockIDBRequest {
  onupgradeneeded: ((e: any) => void) | null = null
  onblocked: ((e: any) => void) | null = null
}

class MockIDBTransaction {
  mode: string
  db: MockIDBDatabase
  storeNames: string[]
  oncomplete: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onabort: ((e: any) => void) | null = null
  error: any = null
  private _pending = 0

  constructor(db: MockIDBDatabase, storeNames: string[], mode: string) {
    this.db = db
    this.storeNames = storeNames
    this.mode = mode
  }

  objectStore(name: string) {
    const store = this.db._stores.get(name)
    if (!store) throw new Error(`NotFoundError: The specified object store was not found: ${name}`)
    return new MockIDBObjectStore(store, this)
  }

  _addRequest() {
    this._pending++
  }

  _requestDone() {
    this._pending--
    if (this._pending === 0) {
      setTimeout(() => {
        if (this.oncomplete) this.oncomplete({ target: this })
      }, 0)
    }
  }
}

class MockIDBObjectStore {
  private _data: Map<string, any>
  private _tx: MockIDBTransaction

  constructor(data: Map<string, any>, tx: MockIDBTransaction) {
    this._data = data
    this._tx = tx
  }

  put(value: any, key: string) {
    const req = new MockIDBRequest()
    this._tx._addRequest()
    this._data.set(key, value)
    req._resolve(key)
    setTimeout(() => this._tx._requestDone(), 1)
    return req
  }

  get(key: string) {
    const req = new MockIDBRequest()
    this._tx._addRequest()
    const val = this._data.get(key)
    req._resolve(val)
    setTimeout(() => this._tx._requestDone(), 1)
    return req
  }

  delete(key: string) {
    const req = new MockIDBRequest()
    this._tx._addRequest()
    this._data.delete(key)
    req._resolve(undefined)
    setTimeout(() => this._tx._requestDone(), 1)
    return req
  }
}

class MockIDBDatabase {
  name: string
  version: number
  objectStoreNames = {
    contains: (name: string) => this._stores.has(name),
  }
  _stores = new Map<string, Map<string, any>>()
  onversionchange: ((e: any) => void) | null = null
  onclose: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  isOpen = true

  constructor(name: string, version: number) {
    this.name = name
    this.version = version
  }

  createObjectStore(name: string) {
    const store = new Map<string, any>()
    this._stores.set(name, store)
    return store
  }

  transaction(storeNames: string | string[], mode: 'readonly' | 'readwrite' = 'readonly') {
    if (!this.isOpen) throw new Error('InvalidStateError: The database connection is closed.')
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    return new MockIDBTransaction(this, names, mode)
  }

  close() {
    this.isOpen = false
    if (this.onclose) this.onclose({ target: this })
  }
}

export class MockIndexedDBFactory {
  openCount = 0
  private _dbs = new Map<string, MockIDBDatabase>()
  shouldFailNextOpen = false

  open(name: string, version: number) {
    this.openCount++
    const req = new MockIDBOpenRequest()

    setTimeout(() => {
      if (this.shouldFailNextOpen) {
        this.shouldFailNextOpen = false
        req._reject(new Error('Simulated Database Open Failure'))
        return
      }

      let db = this._dbs.get(name)
      if (!db || !db.isOpen || db.version < version) {
        const existingStores = db ? db._stores : new Map()
        db = new MockIDBDatabase(name, version)
        db._stores = existingStores
        this._dbs.set(name, db)
        req.result = db
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req })
      }
      req.result = db
      if (req.onsuccess) req.onsuccess({ target: req })
    }, 2)

    return req
  }

  reset() {
    this.openCount = 0
    this._dbs.clear()
    this.shouldFailNextOpen = false
  }
}

// --------------------------------------------------------------------------
// Baseline (Unoptimized) implementation as previously implemented in mediaStorage.ts
// --------------------------------------------------------------------------
function createUnoptimizedStorage(idb: MockIndexedDBFactory) {
  function getDBUncached(): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = idb.open('notecraft_db', 2)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('note_images')) db.createObjectStore('note_images')
        if (!db.objectStoreNames.contains('note_audio')) db.createObjectStore('note_audio')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
    })
  }

  return {
    async saveNoteImage(noteId: string, blob: any) {
      const db = await getDBUncached()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('note_images', 'readwrite')
        tx.objectStore('note_images').put(blob, noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async getNoteImage(noteId: string) {
      const db = await getDBUncached()
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction('note_images', 'readonly')
        const req = tx.objectStore('note_images').get(noteId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    },
    async saveNoteAudio(noteId: string, blob: any) {
      const db = await getDBUncached()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('note_audio', 'readwrite')
        tx.objectStore('note_audio').put(blob, noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async getNoteAudio(noteId: string) {
      const db = await getDBUncached()
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction('note_audio', 'readonly')
        const req = tx.objectStore('note_audio').get(noteId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    },
    // Sequential hydration loop as was in App.tsx
    async hydrateNotesSequential(imageNotes: Array<{ id: string }>, audioNotes: Array<{ id: string }>) {
      const imageUpdates: Record<string, any> = {}
      for (const note of imageNotes) {
        const blob = await this.getNoteImage(note.id)
        if (blob) imageUpdates[note.id] = blob
      }
      const audioUpdates: Record<string, any> = {}
      for (const note of audioNotes) {
        const blob = await this.getNoteAudio(note.id)
        if (blob) audioUpdates[note.id] = blob
      }
      return { imageUpdates, audioUpdates }
    },
  }
}

// --------------------------------------------------------------------------
// Optimized implementation with connection caching & batch parallel lookups
// --------------------------------------------------------------------------
function createOptimizedStorage(idb: MockIndexedDBFactory) {
  let dbPromise: Promise<any> | null = null
  let cachedDb: any = null

  function resetDBCache() {
    if (cachedDb) {
      try {
        cachedDb.close()
      } catch {}
      cachedDb = null
    }
    dbPromise = null
  }

  function getDBCached(): Promise<any> {
    if (cachedDb && cachedDb.isOpen) {
      return Promise.resolve(cachedDb)
    }
    if (dbPromise) {
      return dbPromise
    }

    dbPromise = new Promise<any>((resolve, reject) => {
      let request: any
      try {
        request = idb.open('notecraft_db', 2)
      } catch (err) {
        dbPromise = null
        reject(err)
        return
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('note_images')) db.createObjectStore('note_images')
        if (!db.objectStoreNames.contains('note_audio')) db.createObjectStore('note_audio')
      }

      request.onsuccess = () => {
        const db = request.result
        cachedDb = db

        db.onversionchange = () => {
          resetDBCache()
        }
        db.onclose = () => {
          resetDBCache()
        }
        resolve(db)
      }

      request.onerror = () => {
        const err = request.error || new Error('Failed to open IndexedDB.')
        resetDBCache()
        reject(err)
      }
    }).catch((err) => {
      resetDBCache()
      throw err
    })

    return dbPromise
  }

  return {
    getDB: getDBCached,
    resetDBCache,
    getCachedDbInstance: () => cachedDb,

    async saveNoteImage(noteId: string, blob: any) {
      const db = await getDBCached()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('note_images', 'readwrite')
        tx.objectStore('note_images').put(blob, noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },

    async getNoteImage(noteId: string) {
      const db = await getDBCached()
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction('note_images', 'readonly')
        const req = tx.objectStore('note_images').get(noteId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    },

    async saveNoteAudio(noteId: string, blob: any) {
      const db = await getDBCached()
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('note_audio', 'readwrite')
        tx.objectStore('note_audio').put(blob, noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },

    async getNoteAudio(noteId: string) {
      const db = await getDBCached()
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction('note_audio', 'readonly')
        const req = tx.objectStore('note_audio').get(noteId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    },

    async getNoteImages(noteIds: string[]): Promise<Map<string, any>> {
      const result = new Map<string, any>()
      const validIds = Array.from(new Set(noteIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      if (validIds.length === 0) return result

      const db = await getDBCached()
      return new Promise((resolve) => {
        const tx = db.transaction('note_images', 'readonly')
        const store = tx.objectStore('note_images')
        let pending = validIds.length

        for (const id of validIds) {
          const req = store.get(id)
          req.onsuccess = () => {
            if (req.result) result.set(id, req.result)
            if (--pending === 0) resolve(result)
          }
          req.onerror = () => {
            if (--pending === 0) resolve(result)
          }
        }
        tx.onerror = () => resolve(result)
        tx.onabort = () => resolve(result)
      })
    },

    async getNoteAudios(noteIds: string[]): Promise<Map<string, any>> {
      const result = new Map<string, any>()
      const validIds = Array.from(new Set(noteIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      if (validIds.length === 0) return result

      const db = await getDBCached()
      return new Promise((resolve) => {
        const tx = db.transaction('note_audio', 'readonly')
        const store = tx.objectStore('note_audio')
        let pending = validIds.length

        for (const id of validIds) {
          const req = store.get(id)
          req.onsuccess = () => {
            if (req.result) result.set(id, req.result)
            if (--pending === 0) resolve(result)
          }
          req.onerror = () => {
            if (--pending === 0) resolve(result)
          }
        }
        tx.onerror = () => resolve(result)
        tx.onabort = () => resolve(result)
      })
    },

    async deleteNoteImage(noteId: string): Promise<void> {
      const db = await getDBCached()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('note_images', 'readwrite')
        tx.objectStore('note_images').delete(noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },

    async deleteNoteAudio(noteId: string): Promise<void> {
      const db = await getDBCached()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('note_audio', 'readwrite')
        tx.objectStore('note_audio').delete(noteId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },

    async deleteNotesMedia(noteIds: string[]): Promise<void> {
      const validIds = Array.from(new Set(noteIds.filter((id) => typeof id === 'string' && id.trim().length > 0)))
      if (validIds.length === 0) return

      const db = await getDBCached()
      return new Promise((resolve) => {
        const tx = db.transaction(['note_images', 'note_audio'], 'readwrite')
        const imgStore = tx.objectStore('note_images')
        const audioStore = tx.objectStore('note_audio')
        for (const id of validIds) {
          imgStore.delete(id)
          audioStore.delete(id)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      })
    },

    // Optimized parallel batch hydration
    async hydrateNotesParallel(imageNotes: Array<{ id: string }>, audioNotes: Array<{ id: string }>) {
      const [imageMap, audioMap] = await Promise.all([
        this.getNoteImages(imageNotes.map((n) => n.id)),
        this.getNoteAudios(audioNotes.map((n) => n.id)),
      ])
      const imageUpdates: Record<string, any> = {}
      for (const [id, blob] of imageMap.entries()) {
        imageUpdates[id] = blob
      }
      const audioUpdates: Record<string, any> = {}
      for (const [id, blob] of audioMap.entries()) {
        audioUpdates[id] = blob
      }
      return { imageUpdates, audioUpdates }
    },
  }
}

// --------------------------------------------------------------------------
// Execute Benchmark and Verification Suites
// --------------------------------------------------------------------------
async function runPhase2Suite() {
  console.log('======================================================================')
  console.log('      NOTECRAFT Phase 2: IndexedDB Benchmark & Verification Suite     ')
  console.log('======================================================================\n')

  const idb = new MockIndexedDBFactory()

  // Prepare identical representative test dataset
  const NUM_NOTES = 25
  const mockBlob = (type: string, data: string) => ({ type, data, size: data.length })

  const testImageNotes = Array.from({ length: NUM_NOTES }, (_, i) => ({
    id: `note-img-${i + 1}`,
    blob: mockBlob('image/png', `PNG_DATA_FOR_NOTE_${i + 1}`),
  }))

  const testAudioNotes = Array.from({ length: NUM_NOTES }, (_, i) => ({
    id: `note-aud-${i + 1}`,
    blob: mockBlob('audio/webm', `AUDIO_DATA_FOR_NOTE_${i + 1}`),
  }))

  // --------------------------------------------------------------------------
  // PART 1: BEFORE / BASELINE (Unoptimized)
  // --------------------------------------------------------------------------
  console.log('--- 1. Measuring Baseline (Unoptimized: No Connection Cache, Sequential) ---')
  idb.reset()
  const unoptimized = createUnoptimizedStorage(idb)

  // Seed data
  for (const item of testImageNotes) {
    await unoptimized.saveNoteImage(item.id, item.blob)
  }
  for (const item of testAudioNotes) {
    await unoptimized.saveNoteAudio(item.id, item.blob)
  }
  const seedOpenCalls = idb.openCount
  console.log(`  -> Open calls during seeding (50 writes): ${seedOpenCalls}`)

  // Benchmark Hydration
  idb.openCount = 0
  const t0 = performance.now()
  const unoptHydration = await unoptimized.hydrateNotesSequential(testImageNotes, testAudioNotes)
  const t1 = performance.now()
  const unoptHydrationDurationMs = Math.round(t1 - t0)
  const unoptHydrationOpenCalls = idb.openCount

  console.log(`  -> Hydration Time (50 media lookups): ${unoptHydrationDurationMs} ms`)
  console.log(`  -> Database Open Calls: ${unoptHydrationOpenCalls}`)
  console.log(`  -> Image notes hydrated: ${Object.keys(unoptHydration.imageUpdates).length}`)
  console.log(`  -> Audio notes hydrated: ${Object.keys(unoptHydration.audioUpdates).length}`)

  // --------------------------------------------------------------------------
  // PART 2: AFTER / OPTIMIZED (Cached Connection, Parallel Batch Transactions)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Measuring Optimized (Cached Connection, Parallel Batch Lookups) ---')
  idb.reset()
  const optimized = createOptimizedStorage(idb)

  // Seed data
  for (const item of testImageNotes) {
    await optimized.saveNoteImage(item.id, item.blob)
  }
  for (const item of testAudioNotes) {
    await optimized.saveNoteAudio(item.id, item.blob)
  }
  console.log(`  -> Open calls during seeding (50 writes with cached connection): ${idb.openCount}`)

  // Benchmark Hydration
  idb.openCount = 0
  const t2 = performance.now()
  const optHydration = await optimized.hydrateNotesParallel(testImageNotes, testAudioNotes)
  const t3 = performance.now()
  const optHydrationDurationMs = Math.round(t3 - t2)
  const optHydrationOpenCalls = idb.openCount

  console.log(`  -> Hydration Time (50 media lookups): ${optHydrationDurationMs} ms`)
  console.log(`  -> Database Open Calls: ${optHydrationOpenCalls}`)
  console.log(`  -> Image notes hydrated: ${Object.keys(optHydration.imageUpdates).length}`)
  console.log(`  -> Audio notes hydrated: ${Object.keys(optHydration.audioUpdates).length}`)

  console.log('\n================ BENCHMARK COMPARISON ================')
  console.log(`Database Open Calls:       ${unoptHydrationOpenCalls} -> ${optHydrationOpenCalls} (-${Math.round(((unoptHydrationOpenCalls - optHydrationOpenCalls) / unoptHydrationOpenCalls) * 100)}%)`)
  console.log(`Media Hydration Latency:   ${unoptHydrationDurationMs} ms -> ${optHydrationDurationMs} ms (-${Math.round(((unoptHydrationDurationMs - optHydrationDurationMs) / unoptHydrationDurationMs) * 100)}%)`)
  console.log('======================================================\n')

  // --------------------------------------------------------------------------
  // PART 3: FOCUSED UNIT VERIFICATIONS REQUIRED BY USER
  // --------------------------------------------------------------------------
  console.log('--- 3. Running Focused Verifications ---')

  // Test A: Reusing cached database connection
  console.log('Test A: Reusing cached connection across concurrent calls...')
  const initialOpenCount = idb.openCount
  const [db1, db2, db3] = await Promise.all([optimized.getDB(), optimized.getDB(), optimized.getDB()])
  if (db1 !== db2 || db2 !== db3) throw new Error('Expected db1, db2, db3 to be the same cached instance')
  if (idb.openCount !== initialOpenCount) {
    throw new Error(`Expected zero additional open calls, got ${idb.openCount - initialOpenCount}`)
  }
  console.log('  [PASS] Cached connection successfully shared across all callers.')

  // Test B: Handling failed database opening and retry
  console.log('Test B: Handling failed database opening and retry...')
  optimized.resetDBCache()
  idb.shouldFailNextOpen = true
  let failed = false
  try {
    await optimized.getDB()
  } catch (err: any) {
    failed = true
    if (!err.message.includes('Simulated Database Open Failure')) throw err
  }
  if (!failed) throw new Error('Expected getDB to reject when opening fails')
  // Verify next call retries rather than returning stale rejected promise
  const retryDb = await optimized.getDB()
  console.log('retryDb is:', retryDb, 'isOpen:', retryDb?.isOpen)
  if (!retryDb || !retryDb.isOpen) throw new Error('Expected retry after failure to successfully obtain open DB')
  console.log('  [PASS] Failed opening properly clears promise and retry succeeds cleanly.')

  // Test C: Handling versionchange
  console.log('Test C: Handling versionchange event...')
  const activeDb = await optimized.getDB()
  if (optimized.getCachedDbInstance() !== activeDb) throw new Error('Expected cached DB instance')
  // Simulate another tab requesting versionchange
  activeDb.onversionchange({ target: activeDb })
  if (optimized.getCachedDbInstance() !== null) throw new Error('Expected cachedDb to be reset to null on versionchange')
  if (activeDb.isOpen) throw new Error('Expected activeDb to be closed on versionchange to unblock other tabs')
  console.log('  [PASS] onversionchange closes connection and resets cache immediately.')

  // Test D: Multiple parallel media retrievals & data integrity
  console.log('Test D: Multiple parallel media retrievals...')
  const batchImgResult = await optimized.getNoteImages(testImageNotes.map((n) => n.id))
  const batchAudResult = await optimized.getNoteAudios(testAudioNotes.map((n) => n.id))
  if (batchImgResult.size !== NUM_NOTES) throw new Error(`Expected ${NUM_NOTES} images, got ${batchImgResult.size}`)
  if (batchAudResult.size !== NUM_NOTES) throw new Error(`Expected ${NUM_NOTES} audios, got ${batchAudResult.size}`)
  for (const n of testImageNotes) {
    if (batchImgResult.get(n.id)?.data !== n.blob.data) throw new Error(`Data mismatch for ${n.id}`)
  }
  console.log('  [PASS] All parallel media retrievals returned 100% correct data.')

  // Test E: Missing or corrupted media records
  console.log('Test E: Missing or corrupted media records...')
  const missingResult = await optimized.getNoteImages(['non-existent-1', 'non-existent-2'])
  if (missingResult.size !== 0) throw new Error('Expected empty map for non-existent IDs')
  const singleMissing = await optimized.getNoteImage('non-existent-id')
  if (singleMissing !== null) throw new Error('Expected null for missing note image')
  console.log('  [PASS] Missing records handled gracefully with null fallback.')

  // Test F: Deleting media without affecting unrelated notes
  console.log('Test F: Deleting media without affecting unrelated notes...')
  await optimized.deleteNoteImage(testImageNotes[0].id)
  const deletedItem = await optimized.getNoteImage(testImageNotes[0].id)
  const preservedItem = await optimized.getNoteImage(testImageNotes[1].id)
  if (deletedItem !== null) throw new Error('Expected deleted note image to be null')
  if (!preservedItem || preservedItem.data !== testImageNotes[1].blob.data) {
    throw new Error('Expected unrelated note image to remain intact')
  }
  // Test batch deletion of multiple notes
  await optimized.deleteNotesMedia([testImageNotes[1].id, testAudioNotes[0].id])
  const deletedBatchImg = await optimized.getNoteImage(testImageNotes[1].id)
  const deletedBatchAud = await optimized.getNoteAudio(testAudioNotes[0].id)
  const preservedBatchAud = await optimized.getNoteAudio(testAudioNotes[1].id)
  if (deletedBatchImg !== null || deletedBatchAud !== null) throw new Error('Expected batch deleted items to be null')
  if (!preservedBatchAud || preservedBatchAud.data !== testAudioNotes[1].blob.data) {
    throw new Error('Expected preserved audio to remain intact')
  }
  console.log('  [PASS] Media deletion is strictly isolated; unrelated notes untouched.')

  console.log('\n======================================================================')
  console.log(' ALL PHASE 2 INDEXEDDB PERFORMANCE & INTEGRITY TESTS PASSED!')
  console.log('======================================================================\n')
}

runPhase2Suite().catch((err) => {
  console.error('[PHASE 2 ERROR]', err)
  process.exit(1)
})
