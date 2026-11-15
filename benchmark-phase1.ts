import './src/env.js'
import pg from 'pg'
import { app } from './src/index.js'
import { prisma } from './src/db.js'
import type { Server } from 'node:http'

const TEST_PORT = 3125
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

let queryCount = 0
let recordedQueries: string[] = []

const originalQuery = pg.Client.prototype.query
pg.Client.prototype.query = function (...args: any[]) {
  queryCount++
  if (typeof args[0] === 'string') {
    recordedQueries.push(args[0].substring(0, 100))
  } else if (args[0] && typeof args[0].text === 'string') {
    recordedQueries.push(args[0].text.substring(0, 100))
  }
  return (originalQuery as any).apply(this, args)
}

function resetCounter() {
  queryCount = 0
  recordedQueries = []
}

async function runBenchmark() {
  console.log('=================================================================')
  console.log('      NOTECRAFT Phase 1: Database Query Benchmark Suite          ')
  console.log('=================================================================\n')

  let server: Server | null = null

  try {
    server = app.listen(TEST_PORT)
    console.log(`[INIT] Benchmark server running on ${BASE_URL}`)

    // 1. Setup Benchmark Test User
    const userEmail = `bench_${Date.now()}@notecraft.test`
    const userPassword = 'Password123!Secure'
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, password: userPassword, name: 'Benchmark User' }),
    })
    const signupData = await signupRes.json()
    const token = signupData.token
    const userId = signupData.user.id
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }

    console.log(`[INIT] Benchmark user created (userId: ${userId})`)

    // -------------------------------------------------------------
    // BENCHMARK 1: POST /api/sync with 20 New Notes (Creation)
    // -------------------------------------------------------------
    console.log('\n>>> BENCHMARK 1: POST /api/sync — 20 New Notes (Creation)')
    const newNotes = Array.from({ length: 20 }, (_, i) => ({
      id: `bench-note-new-${i + 1}-${Date.now()}`,
      title: `Benchmark New Note ${i + 1}`,
      body: `Detailed content for benchmark new note number ${i + 1}. Contains performance testing payload.`,
      excerpt: `Benchmark Note ${i + 1}`,
      tags: ['benchmark', 'phase1', `tag${i}`],
      category: 'Work',
      tone: 'emerald',
      kind: 'text',
      pinned: i % 5 === 0,
      favorite: i % 3 === 0,
      archived: false,
      trashed: false,
      hasImage: false,
      hasAudio: false,
      updatedAt: new Date().toISOString(),
    }))

    resetCounter()
    const t0 = performance.now()
    const syncCreateRes = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ clientNotes: newNotes, deletedNoteIds: [] }),
    })
    const t1 = performance.now()
    const syncCreateData = await syncCreateRes.json()
    const syncCreateTimeMs = Math.round(t1 - t0)
    const syncCreateQueries = queryCount

    if (!syncCreateData.success || syncCreateData.notes.length !== 20) {
      throw new Error(`Benchmark 1 failed: expected 20 notes, got ${syncCreateData.notes?.length}`)
    }
    console.log(`  -> Duration: ${syncCreateTimeMs} ms`)
    console.log(`  -> SQL Queries Executed: ${syncCreateQueries}`)
    console.log(`  -> Applied Count: ${syncCreateData.appliedCount}`)
    console.log(`  -> Server returned: ${syncCreateData.notes.length} notes`)

    // -------------------------------------------------------------
    // BENCHMARK 2: POST /api/sync — 10 Updates + 10 Deletions
    // -------------------------------------------------------------
    console.log('\n>>> BENCHMARK 2: POST /api/sync — 10 Updates + 10 Deletions with Media')
    // Attach media to 5 of the notes that will be deleted
    const notesToDelete = newNotes.slice(10, 20)
    const notesToUpdate = newNotes.slice(0, 10)

    for (let i = 0; i < 5; i++) {
      await prisma.media.create({
        data: {
          noteId: notesToDelete[i].id,
          userId,
          kind: 'image',
          storageKey: `bench-storage-key-${i}-${Date.now()}`,
          fileName: `test-${i}.png`,
          mimeType: 'image/png',
          sizeBytes: 1024,
        },
      })
    }

    const updatedNotesPayload = notesToUpdate.map((n) => ({
      ...n,
      title: `${n.title} (Updated)`,
      body: `${n.body} - Edited during benchmark pass 2.`,
      updatedAt: new Date(Date.now() + 5000).toISOString(),
    }))
    const deletedNoteIdsPayload = notesToDelete.map((n) => n.id)

    resetCounter()
    const t2 = performance.now()
    const syncUpdateRes = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        clientNotes: updatedNotesPayload,
        deletedNoteIds: deletedNoteIdsPayload,
      }),
    })
    const t3 = performance.now()
    const syncUpdateData = await syncUpdateRes.json()
    const syncUpdateTimeMs = Math.round(t3 - t2)
    const syncUpdateQueries = queryCount

    if (!syncUpdateData.success || syncUpdateData.notes.length !== 10) {
      throw new Error(`Benchmark 2 failed: expected 10 active notes, got ${syncUpdateData.notes?.length}`)
    }
    if (syncUpdateData.deletedNoteIds.length !== 10) {
      throw new Error(`Benchmark 2 failed: expected 10 tombstones, got ${syncUpdateData.deletedNoteIds?.length}`)
    }
    console.log(`  -> Duration: ${syncUpdateTimeMs} ms`)
    console.log(`  -> SQL Queries Executed: ${syncUpdateQueries}`)
    console.log(`  -> Active Notes Remaining: ${syncUpdateData.notes.length}`)
    console.log(`  -> Tombstones Recorded: ${syncUpdateData.deletedNoteIds.length}`)

    // -------------------------------------------------------------
    // BENCHMARK 3: POST /api/notes/import with 30 Notes
    // -------------------------------------------------------------
    console.log('\n>>> BENCHMARK 3: POST /api/notes/import — 30 Notes Import')
    const importNotes = Array.from({ length: 30 }, (_, i) => ({
      id: `bench-import-${i + 1}-${Date.now()}`,
      title: `Imported Note ${i + 1}`,
      body: `Import payload body text for item ${i + 1}.`,
      excerpt: `Import Excerpt ${i + 1}`,
      tags: ['import', 'test'],
      category: 'Personal',
      tone: 'violet',
      kind: 'text',
      pinned: false,
      favorite: false,
      archived: false,
      trashed: false,
      hasImage: false,
      hasAudio: false,
    }))

    resetCounter()
    const t4 = performance.now()
    const importRes = await fetch(`${BASE_URL}/api/notes/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ notes: importNotes }),
    })
    const t5 = performance.now()
    const importData = await importRes.json()
    const importTimeMs = Math.round(t5 - t4)
    const importQueries = queryCount

    if (!importData.success || importData.importedCount !== 30) {
      throw new Error(`Benchmark 3 failed: expected 30 imported, got ${importData.importedCount}`)
    }
    console.log(`  -> Duration: ${importTimeMs} ms`)
    console.log(`  -> SQL Queries Executed: ${importQueries}`)
    console.log(`  -> Imported Count: ${importData.importedCount}`)

    // Summary output JSON for automated recording
    const results = {
      benchmark1_sync_create_20: {
        durationMs: syncCreateTimeMs,
        queries: syncCreateQueries,
      },
      benchmark2_sync_update_delete_10_10: {
        durationMs: syncUpdateTimeMs,
        queries: syncUpdateQueries,
      },
      benchmark3_import_30: {
        durationMs: importTimeMs,
        queries: importQueries,
      },
      totalDurationMs: syncCreateTimeMs + syncUpdateTimeMs + importTimeMs,
      totalQueries: syncCreateQueries + syncUpdateQueries + importQueries,
    }

    console.log('\n================ BENCHMARK SUMMARY ================')
    console.log(JSON.stringify(results, null, 2))
    console.log('===================================================\n')

    // Cleanup benchmark test user and data
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  } finally {
    if (server) {
      server.close()
    }
    await prisma.$disconnect().catch(() => {})
  }
}

runBenchmark().catch((err) => {
  console.error('[BENCHMARK ERROR]', err)
  process.exit(1)
})
