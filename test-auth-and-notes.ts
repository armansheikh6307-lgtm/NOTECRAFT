import { app } from './src/index.js'
import { prisma } from './src/db.js'
import type { Server } from 'node:http'

const TEST_PORT = 3099
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

async function runTests() {
  console.log('=== Starting NOTECRAFT Backend & Database Verification ===')

  let server: Server | null = null

  try {
    // 1. Start test server
    server = app.listen(TEST_PORT)
    console.log(`[PASS] Server started on ${BASE_URL}`)

    // 2. Test GET /api/health
    const healthRes = await fetch(`${BASE_URL}/api/health`)
    const healthData = await healthRes.json()
    console.log('[TEST] /api/health:', healthData)
    if (!healthData.databaseConnected) {
      throw new Error('Database is not connected according to /api/health')
    }
    console.log('[PASS] Database is connected and verified.')

    // 3. Test signup
    const testEmail = `tester_${Date.now()}@notecraft.test`
    const testPassword = 'Password123!'
    const testName = 'Test User'

    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: testName }),
    })
    const signupData = await signupRes.json()
    console.log('[TEST] /api/auth/signup status:', signupRes.status, signupData.success ? 'Success' : signupData)
    if (!signupData.token || signupData.user?.email !== testEmail) {
      throw new Error('Signup failed to return token or matching user')
    }
    const token = signupData.token
    const userId = signupData.user.id
    console.log('[PASS] Signup successful with valid token generated.')

    // 4. Test duplicate signup rejection
    const dupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    console.log('[TEST] Duplicate signup rejection status:', dupRes.status)
    if (dupRes.status !== 409) {
      throw new Error(`Expected 409 for duplicate signup, got ${dupRes.status}`)
    }
    console.log('[PASS] Duplicate email registration correctly rejected.')

    // 5. Test login (invalid and valid)
    const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword' }),
    })
    if (badLoginRes.status !== 401) {
      throw new Error(`Expected 401 for wrong password, got ${badLoginRes.status}`)
    }
    console.log('[PASS] Bad login correctly rejected with 401.')

    const goodLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    const goodLoginData = await goodLoginRes.json()
    if (!goodLoginData.token) {
      throw new Error('Valid login failed to return token')
    }
    console.log('[PASS] Valid login succeeded.')

    // 6. Test GET /api/auth/me
    const unauthMe = await fetch(`${BASE_URL}/api/auth/me`)
    if (unauthMe.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated /api/auth/me, got ${unauthMe.status}`)
    }
    console.log('[PASS] Unauthenticated /api/auth/me correctly protected.')

    const authMe = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const meData = await authMe.json()
    if (!meData.user || meData.user.email !== testEmail) {
      throw new Error('Authenticated /api/auth/me failed to return user profile')
    }
    console.log('[PASS] Authenticated /api/auth/me returned correct user profile.')

    // 7. Test Note CRUD
    const noteId = `test-note-${Date.now()}`
    const createNoteRes = await fetch(`${BASE_URL}/api/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: noteId,
        title: 'Integration Test Note',
        body: 'Testing PostgreSQL persistence and user isolation.',
        category: 'Work',
        tags: ['test', 'postgres'],
        hasImage: false,
        hasAudio: false,
      }),
    })
    const createNoteData = await createNoteRes.json()
    if (!createNoteData.success || createNoteData.note?.id !== noteId) {
      throw new Error(`Failed to create note: ${JSON.stringify(createNoteData)}`)
    }
    console.log('[PASS] Note created successfully in PostgreSQL.')

    // 8. Test Note Listing
    const listNotesRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const listNotesData = await listNotesRes.json()
    if (!Array.isArray(listNotesData.notes) || listNotesData.notes.length === 0) {
      throw new Error('Failed to retrieve user notes')
    }
    const foundNote = listNotesData.notes.find((n: any) => n.id === noteId)
    if (!foundNote || foundNote.title !== 'Integration Test Note') {
      throw new Error('Created note not found in list response')
    }
    console.log('[PASS] Note listing returned created note.')

    // 9. Test Note Update
    const updateNoteRes = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Updated Note Title',
        favorite: true,
      }),
    })
    const updateNoteData = await updateNoteRes.json()
    if (!updateNoteData.success || updateNoteData.note.title !== 'Updated Note Title' || !updateNoteData.note.favorite) {
      throw new Error(`Update failed: ${JSON.stringify(updateNoteData)}`)
    }
    console.log('[PASS] Note updated successfully.')

    // 10. Test Safe Import of Local Notes
    const importNoteId = `imported-note-${Date.now()}`
    const importRes = await fetch(`${BASE_URL}/api/notes/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        notes: [
          {
            id: importNoteId,
            title: 'Imported Local Note',
            body: 'This note was created locally before logging in.',
            category: 'Personal',
            tags: ['offline', 'imported'],
          },
        ],
      }),
    })
    const importData = await importRes.json()
    if (!importData.success || importData.importedCount !== 1) {
      throw new Error(`Import failed: ${JSON.stringify(importData)}`)
    }
    console.log('[PASS] Safe import endpoint succeeded (1 note imported).')

    // 11. Test Note Deletion
    const deleteRes = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const deleteData = await deleteRes.json()
    if (!deleteData.success) {
      throw new Error(`Delete failed: ${JSON.stringify(deleteData)}`)
    }
    console.log('[PASS] Note deleted successfully.')

    // 12. Cleanup test records
    await prisma.note.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    console.log('[PASS] Test records cleaned up from PostgreSQL.')

    console.log('=== ALL DATABASE & AUTHENTICATION TESTS PASSED SUCCESSFULLY! ===')
  } finally {
    if (server) {
      server.close()
    }
    await prisma.$disconnect()
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})

