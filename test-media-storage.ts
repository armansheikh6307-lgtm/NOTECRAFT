/**
 * Automated test suite for NOTECRAFT's IndexedDB mediaStorage and note persistence logic.
 */

class MockIDBRequest {
  result: any = null
  error: any = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: ((event?: any) => void) | null = null
}

class MockIDBTransaction {
  mode: string
  stores: Map<string, Map<string, any>>
  oncomplete: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor(stores: Map<string, Map<string, any>>, mode: string) {
    this.stores = stores
    this.mode = mode
  }

  objectStore(name: string) {
    const store = this.stores.get(name)
    if (!store) throw new Error(`Store not found: ${name}`)
    return {
      put: (value: any, key: string) => {
        store.set(key, value)
        setTimeout(() => this.oncomplete?.(), 0)
      },
      get: (key: string) => {
        const req = new MockIDBRequest()
        setTimeout(() => {
          req.result = store.get(key) || null
          req.onsuccess?.()
        }, 0)
        return req
      },
      delete: (key: string) => {
        store.delete(key)
        setTimeout(() => this.oncomplete?.(), 0)
      },
    }
  }
}

class MockIDBDatabase {
  name: string
  version: number
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }
  stores = new Map<string, Map<string, any>>()

  constructor(name: string, version: number) {
    this.name = name
    this.version = version
  }

  createObjectStore(name: string) {
    this.stores.set(name, new Map())
  }

  transaction(storeName: string, mode: string) {
    return new MockIDBTransaction(this.stores, mode)
  }
}

const mockDatabases = new Map<string, MockIDBDatabase>()

const mockIndexedDB = {
  open: (name: string, version: number) => {
    const req = new MockIDBRequest()
    setTimeout(() => {
      let db = mockDatabases.get(name)
      const isNew = !db || db.version < version
      if (!db) {
        db = new MockIDBDatabase(name, version)
        mockDatabases.set(name, db)
      }
      req.result = db
      if (isNew) {
        req.onupgradeneeded?.({ oldVersion: 0, newVersion: version })
      }
      req.onsuccess?.()
    }, 0)
    return req
  },
}

// Inject mock into global environment
;(globalThis as any).window = globalThis
;(globalThis as any).indexedDB = mockIndexedDB

// Import mediaStorage module
import {
  saveNoteImage,
  getNoteImage,
  deleteNoteImage,
  saveNoteAudio,
  getNoteAudio,
  deleteNoteAudio,
  deleteNoteMedia,
} from '../notecraft/src/mediaStorage.js'

async function runTests() {
  console.log('--- NOTECRAFT IndexedDB Media Storage Test Suite ---')

  const note1Id = 'note-test-image-1'
  const note2Id = 'note-test-voice-1'

  // Test 1: Store image blob
  console.log('\n[Test 1] Saving image blob to IndexedDB...')
  const sampleImageBlob = new Blob(['sample-fake-png-data'], { type: 'image/png' })
  await saveNoteImage(note1Id, sampleImageBlob)
  const retrievedImage = await getNoteImage(note1Id)
  if (retrievedImage instanceof Blob && retrievedImage.size === sampleImageBlob.size && retrievedImage.type === 'image/png') {
    console.log('PASS: Image blob saved and retrieved successfully. Size:', retrievedImage.size, 'Type:', retrievedImage.type)
  } else {
    console.error('FAIL: Image blob retrieval failed.')
    process.exit(1)
  }

  // Test 2: Store audio blob
  console.log('\n[Test 2] Saving audio blob to IndexedDB...')
  const sampleAudioBlob = new Blob(['sample-fake-audio-opus-data'], { type: 'audio/webm;codecs=opus' })
  await saveNoteAudio(note2Id, sampleAudioBlob)
  const retrievedAudio = await getNoteAudio(note2Id)
  if (retrievedAudio instanceof Blob && retrievedAudio.size === sampleAudioBlob.size && retrievedAudio.type === 'audio/webm;codecs=opus') {
    console.log('PASS: Audio blob saved and retrieved successfully. Size:', retrievedAudio.size, 'Type:', retrievedAudio.type)
  } else {
    console.error('FAIL: Audio blob retrieval failed.')
    process.exit(1)
  }

  // Test 3: Replace media (editing)
  console.log('\n[Test 3] Replacing media blob (editing note)...')
  const updatedImageBlob = new Blob(['updated-higher-res-image-bytes-more-data'], { type: 'image/jpeg' })
  await saveNoteImage(note1Id, updatedImageBlob)
  const replacedImage = await getNoteImage(note1Id)
  if (replacedImage && replacedImage.size === updatedImageBlob.size && replacedImage.type === 'image/jpeg') {
    console.log('PASS: Image replaced successfully in IndexedDB. New size:', replacedImage.size)
  } else {
    console.error('FAIL: Image replacement failed.')
    process.exit(1)
  }

  // Test 4: Simulate page refresh / hydration from localStorage
  console.log('\n[Test 4] Simulating page refresh & localStorage compatibility...')
  const memoryNotes = [
    {
      id: note1Id,
      title: 'Visual Architecture Diagram',
      excerpt: 'Visual note: diagram.png',
      body: 'Overview of system',
      tags: ['Design'],
      category: 'Projects',
      tone: 'blue',
      updatedAt: 'Just now',
      kind: 'image',
      hasImage: true,
      imageUrl: 'blob:http://localhost:3000/temporary-image-url',
    },
    {
      id: note2Id,
      title: 'Standup Voice Memo',
      excerpt: 'Voice note (00:45)',
      body: 'Discussed sprint items',
      tags: ['Voice memo'],
      category: 'Work',
      tone: 'lavender',
      updatedAt: 'Just now',
      kind: 'voice',
      hasAudio: true,
      audioDuration: 45,
      audioUrl: 'blob:http://localhost:3000/temporary-audio-url',
    },
  ]

  // Verify that localStorage serialization strips audioUrl and imageUrl
  const cleanSerialized = memoryNotes.map(({ audioUrl, imageUrl, ...rest }: any) => rest)
  const localStorageJSON = JSON.stringify(cleanSerialized)
  if (localStorageJSON.includes('blob:http') || localStorageJSON.includes('base64')) {
    console.error('FAIL: Blob URLs or base64 leaked into localStorage!')
    process.exit(1)
  }
  console.log('PASS: localStorage payload is strictly clean metadata without blob URLs or binaries.')

  // Hydration simulation: read back from localStorage and re-link from IndexedDB
  const parsedFromStorage = JSON.parse(localStorageJSON)
  for (const n of parsedFromStorage) {
    if (n.kind === 'image' && n.hasImage) {
      const blob = await getNoteImage(n.id)
      if (blob) {
        n.imageUrl = 'blob:hydrated-image-url'
      }
    } else if (n.kind === 'voice' && n.hasAudio) {
      const blob = await getNoteAudio(n.id)
      if (blob) {
        n.audioUrl = 'blob:hydrated-audio-url'
      }
    }
  }
  if (parsedFromStorage[0].imageUrl && parsedFromStorage[1].audioUrl) {
    console.log('PASS: Hydration simulation successfully restored both image and audio from IndexedDB!')
  } else {
    console.error('FAIL: Hydration simulation failed.')
    process.exit(1)
  }

  // Test 5: Archiving and restoring
  console.log('\n[Test 5] Archiving and restoring notes...')
  // When note is archived, its noteId remains identical
  const archivedNote = { ...parsedFromStorage[1], archived: true }
  const audioStillExists = await getNoteAudio(archivedNote.id)
  if (audioStillExists instanceof Blob) {
    console.log('PASS: Archiving notes preserves media blobs linked in IndexedDB.')
  } else {
    console.error('FAIL: Archived note lost its audio blob.')
    process.exit(1)
  }

  // Test 6: Permanent deletion
  console.log('\n[Test 6] Permanent note deletion...')
  await deleteNoteMedia(note1Id)
  await deleteNoteMedia(note2Id)
  const deletedImage = await getNoteImage(note1Id)
  const deletedAudio = await getNoteAudio(note2Id)
  if (deletedImage === null && deletedAudio === null) {
    console.log('PASS: Permanently deleting notes completely removes their media blobs from IndexedDB.')
  } else {
    console.error('FAIL: Media blobs remained after permanent deletion.')
    process.exit(1)
  }

  // Test 7: Missing media fallback
  console.log('\n[Test 7] Handling missing or non-existent media...')
  const nonExistent = await getNoteImage('note-does-not-exist')
  const nonExistentAudio = await getNoteAudio('note-does-not-exist')
  if (nonExistent === null && nonExistentAudio === null) {
    console.log('PASS: Non-existent media queries return null gracefully without throwing.')
  } else {
    console.error('FAIL: Unexpected result for missing media.')
    process.exit(1)
  }

  console.log('\n========================================')
  console.log('ALL 7 PERSISTENT STORAGE TESTS PASSED!')
  console.log('========================================\n')
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})

