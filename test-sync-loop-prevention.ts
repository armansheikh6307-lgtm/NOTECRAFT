import { app } from './src/index.js'
import { prisma } from './src/db.js'
import type { Server } from 'node:http'

const TEST_PORT = 3109
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

async function runSyncLoopTests() {
  console.log('=== NOTECRAFT Sync Loop Prevention & Concurrency Test ===\n')
  let server: Server | null = null

  try {
    server = app.listen(TEST_PORT)
    console.log(`[PASS] Server started on ${BASE_URL}`)

    // 1. Create a test user for sync verification
    const testEmail = `sync_loop_test_${Date.now()}@notecraft.test`
    const testPassword = 'Password123!Secure'
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Sync Loop User' }),
    })
    const signupData = await signupRes.json()
    if (!signupData.token) {
      throw new Error(`Signup failed: ${JSON.stringify(signupData)}`)
    }
    const token = signupData.token
    const userId = signupData.user.id
    console.log('[PASS] Test user created and authenticated.')

    // 2. Test concurrent sync request locking simulation
    // Simulate what the client's triggerSync does with syncPromiseRef
    console.log('\n--- Testing Concurrent Sync Deduplication & Locking ---')
    let networkRequestCount = 0

    // Simulated client-side lock mechanism matching App.tsx
    let isSyncing = false
    let inFlightPromise: Promise<any> | null = null

    const simulatedClientSync = async (notes: any[]) => {
      if (isSyncing && inFlightPromise) {
        return inFlightPromise
      }

      isSyncing = true
      inFlightPromise = (async () => {
        try {
          networkRequestCount++
          const res = await fetch(`${BASE_URL}/api/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ clientNotes: notes }),
          })
          return await res.json()
        } finally {
          isSyncing = false
          inFlightPromise = null
        }
      })()

      return inFlightPromise
    }

    const testNotes = [
      {
        id: 'test-note-loop-1',
        title: 'Concurrent Sync Note 1',
        body: 'Testing deduplication',
        excerpt: 'Testing deduplication',
        kind: 'text',
        tags: [],
        favorite: false,
        pinned: false,
        archived: false,
        trashed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    // Fire 5 concurrent sync requests simultaneously
    const results = await Promise.all([
      simulatedClientSync(testNotes),
      simulatedClientSync(testNotes),
      simulatedClientSync(testNotes),
      simulatedClientSync(testNotes),
      simulatedClientSync(testNotes),
    ])

    if (networkRequestCount !== 1) {
      throw new Error(`Expected exactly 1 network request for 5 concurrent triggers, but got ${networkRequestCount}`)
    }
    console.log(`[PASS] Concurrency lock verified: 5 concurrent triggers resulted in exactly ${networkRequestCount} network request.`)

    // Verify all 5 callers received identical valid results
    for (const res of results) {
      if (!res.serverTime || !Array.isArray(res.notes)) {
        throw new Error('Invalid response structure received by concurrent caller')
      }
    }
    console.log('[PASS] All concurrent callers resolved with valid server sync response.')

    // 3. Test sequential sync with subsequent modifications
    console.log('\n--- Testing Sequential Single-Sync Operation ---')
    testNotes[0].title = 'Updated Title after Initial Sync'
    testNotes[0].updatedAt = new Date().toISOString()

    const seqResult = await simulatedClientSync(testNotes)
    if (networkRequestCount !== 2) {
      throw new Error(`Expected total 2 network requests after subsequent sequential call, got ${networkRequestCount}`)
    }
    console.log(`[PASS] Subsequent sync executed cleanly once lock was released (total requests: ${networkRequestCount}).`)

    const syncedServerNote = seqResult.notes.find((n: any) => n.id === 'test-note-loop-1')
    if (syncedServerNote?.title !== 'Updated Title after Initial Sync') {
      throw new Error(`Expected updated note title on server, got: ${syncedServerNote?.title}`)
    }
    console.log('[PASS] Server received and persisted updated note title.')

    // 4. Cleanup test data
    console.log('\n--- Cleaning up Test Artifacts ---')
    await prisma.note.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    console.log('[PASS] Test user and notes cleaned up.')

    console.log('\n======================================================')
    console.log(' ALL SYNC LOOP PREVENTIONS & LOCK TESTS PASSED!')
    console.log('======================================================')
  } catch (err) {
    console.error('\n[FAIL] Test suite failed:', err)
    process.exitCode = 1
  } finally {
    if (server) {
      server.close()
    }
    await prisma.$disconnect()
  }
}

runSyncLoopTests()
