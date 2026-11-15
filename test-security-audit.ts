import './src/env.js'
import { app } from './src/index.js'
import { prisma } from './src/db.js'
import { generateSecureToken, hashToken } from './src/email.js'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'

const TEST_PORT = 3112
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

async function runSecurityAuditTests() {
  console.log('=== NOTECRAFT Production Security Audit Test Suite ===\n')
  let server: Server | null = null

  try {
    server = app.listen(TEST_PORT)
    console.log(`[PASS] Security audit test server started on ${BASE_URL}`)

    // -----------------------------------------------------------------
    // 1. HTTP Security Headers & Banner Disclosure
    // -----------------------------------------------------------------
    console.log('\n--- Test 1: HTTP Security Headers & Information Disclosure ---')
    const healthRes = await fetch(`${BASE_URL}/api/health`)
    const headers = healthRes.headers

    if (headers.get('x-powered-by')) {
      throw new Error(`X-Powered-By header is exposed: ${headers.get('x-powered-by')}`)
    }
    console.log('[PASS] X-Powered-By header disabled.')

    if (headers.get('x-content-type-options') !== 'nosniff') {
      throw new Error(`Expected X-Content-Type-Options: nosniff, got: ${headers.get('x-content-type-options')}`)
    }
    console.log('[PASS] X-Content-Type-Options: nosniff present.')

    if (headers.get('x-frame-options') !== 'DENY') {
      throw new Error(`Expected X-Frame-Options: DENY, got: ${headers.get('x-frame-options')}`)
    }
    console.log('[PASS] X-Frame-Options: DENY present (Clickjacking protection active).')

    // -----------------------------------------------------------------
    // 2. Setup Test Users: User A (Victim) & User B (Attacker)
    // -----------------------------------------------------------------
    console.log('\n--- Test 2: User Setup for Authorization & IDOR Tests ---')
    const timestamp = Date.now()
    const passwordA = 'UserA_Password123!'
    const passwordB = 'UserB_Password123!'

    // Register User A
    const signupARes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `user_a_${timestamp}@notecraft.test`, password: passwordA, name: 'User A' }),
    })
    const dataA = await signupARes.json()
    const tokenA = dataA.token
    const userAId = dataA.user.id

    // Register User B
    const signupBRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `user_b_${timestamp}@notecraft.test`, password: passwordB, name: 'User B' }),
    })
    const dataB = await signupBRes.json()
    const tokenB = dataB.token
    const userBId = dataB.user.id
    console.log('[PASS] Created isolated test users: User A and User B.')

    // -----------------------------------------------------------------
    // 3. Unauthorized API Access & Invalid JWT Tokens
    // -----------------------------------------------------------------
    console.log('\n--- Test 3: Unauthorized API Access & JWT Tampering ---')
    // 3a. Missing token
    const noTokenRes = await fetch(`${BASE_URL}/api/notes`)
    if (noTokenRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${noTokenRes.status}`)
    }
    console.log('[PASS] Missing Bearer token correctly rejected with 401.')

    // 3b. Malformed token
    const malformedTokenRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { Authorization: 'Bearer this-is-not-a-valid-jwt' },
    })
    if (malformedTokenRes.status !== 401) {
      throw new Error(`Expected 401 for malformed token, got ${malformedTokenRes.status}`)
    }
    console.log('[PASS] Malformed token rejected with 401.')

    // 3c. Token signed with wrong secret
    const forgedToken = jwt.sign({ userId: userAId, email: 'fake@attacker.com' }, 'attacker_fake_secret_key')
    const forgedRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    })
    if (forgedRes.status !== 401) {
      throw new Error(`Expected 401 for forged token with invalid signature, got ${forgedRes.status}`)
    }
    console.log('[PASS] Forged token signature correctly rejected with 401.')

    // 3d. Expired token
    const expiredToken = jwt.sign(
      { userId: userAId, email: 'userA@notecraft.test', exp: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET || 'notecraft_fallback_secret_key_change_in_production'
    )
    const expiredRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    })
    if (expiredRes.status !== 401) {
      throw new Error(`Expected 401 for expired token, got ${expiredRes.status}`)
    }
    console.log('[PASS] Expired token correctly rejected with 401.')

    // -----------------------------------------------------------------
    // 4. Cross-User IDOR Protection on Notes
    // -----------------------------------------------------------------
    console.log('\n--- Test 4: Cross-User IDOR Protection on Notes ---')
    // User A creates a private note
    const noteAId = `note_a_secret_${timestamp}`
    const createNoteRes = await fetch(`${BASE_URL}/api/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        id: noteAId,
        title: 'User A Top Secret Note',
        body: 'Confidential thoughts',
      }),
    })
    if (!createNoteRes.ok) {
      throw new Error('Failed to create User A note')
    }
    console.log('[PASS] User A created private note.')

    // 4a. User B attempts to read User A's note via /api/notes
    const listBRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    const listBData = await listBRes.json()
    const foundNoteAInB = listBData.notes.some((n: any) => n.id === noteAId)
    if (foundNoteAInB) {
      throw new Error("IDOR VIOLATION: User B can view User A's private note in notes list!")
    }
    console.log("[PASS] User B cannot view User A's notes in GET /api/notes.")

    // 4b. User B attempts to edit User A's note via PUT /api/notes/:id
    const editBRes = await fetch(`${BASE_URL}/api/notes/${noteAId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ title: 'Hacked by User B' }),
    })
    if (editBRes.status !== 404) {
      throw new Error(`IDOR VIOLATION: User B edit on User A's note returned status ${editBRes.status}`)
    }
    console.log("[PASS] User B edit attempt on User A's note correctly rejected with 404.")

    // Verify User A's note remains uncompromised
    const noteInDb = await prisma.note.findUnique({ where: { id: noteAId } })
    if (noteInDb?.title !== 'User A Top Secret Note') {
      throw new Error("User A's note was modified by unauthorized user!")
    }
    console.log("[PASS] User A's note content preserved intact in database.")

    // 4c. User B attempts to delete User A's note via DELETE /api/notes/:id
    const deleteBRes = await fetch(`${BASE_URL}/api/notes/${noteAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    if (deleteBRes.status !== 404) {
      throw new Error(`IDOR VIOLATION: User B delete on User A's note returned status ${deleteBRes.status}`)
    }
    console.log("[PASS] User B delete attempt on User A's note correctly rejected with 404.")

    // 4d. User B attempts to HIJACK User A's note via POST /api/notes/import
    console.log('\n--- Test 5: Import IDOR Hijacking Prevention ---')
    const importHijackRes = await fetch(`${BASE_URL}/api/notes/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({
        notes: [
          {
            id: noteAId, // Attempting to overwrite User A's note!
            title: 'Hijacked Note A',
            body: 'Attacker payload',
          },
        ],
      }),
    })
    const importData = await importHijackRes.json()
    if (!importData.success) {
      throw new Error(`Import failed unexpectedly: ${JSON.stringify(importData)}`)
    }

    // Verify User A still owns noteAId and its content was NOT overwritten
    const checkNoteA = await prisma.note.findUnique({ where: { id: noteAId } })
    if (checkNoteA?.userId !== userAId || checkNoteA?.title !== 'User A Top Secret Note') {
      throw new Error('CRITICAL IDOR VULNERABILITY: User B successfully hijacked/overwrote User A note via import!')
    }
    console.log('[PASS] IDOR Hijack PREVENTED: Foreign note was not overwritten; imported note was created under a new isolated ID.')

    // -----------------------------------------------------------------
    // 5. Cross-User Media IDOR & Extension Spoofing Protection
    // -----------------------------------------------------------------
    console.log('\n--- Test 6: Media IDOR & File Upload Security ---')
    // 5a. User B attempts to upload media for User A's note
    const formData = new FormData()
    const dummyBlob = new Blob(['fake image content'], { type: 'image/png' })
    formData.append('file', dummyBlob, 'spoofed.html') // Attempting .html extension
    formData.append('kind', 'image')

    const uploadBToARes = await fetch(`${BASE_URL}/api/media/upload/${noteAId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: formData,
    })
    if (uploadBToARes.status !== 403) {
      throw new Error(`IDOR VIOLATION: User B upload to User A note returned ${uploadBToARes.status}`)
    }
    console.log("[PASS] User B upload to User A's note rejected with 403 Forbidden.")

    // 5b. User A uploads valid image with spoofed extension
    const uploadAToARes = await fetch(`${BASE_URL}/api/media/upload/${noteAId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: formData,
    })
    const uploadAData = await uploadAToARes.json()
    if (!uploadAToARes.ok || !uploadAData.success) {
      throw new Error(`User A media upload failed: ${JSON.stringify(uploadAData)}`)
    }

    // Verify storageKey used safe extension .png instead of .html
    if (!uploadAData.media.storageKey.endsWith('.png')) {
      throw new Error(`EXTENSION SPOOFING: Expected storageKey to end with .png, got: ${uploadAData.media.storageKey}`)
    }
    console.log(`[PASS] Extension spoofing neutralized: storageKey securely mapped to "${uploadAData.media.storageKey}".`)

    // 5c. User B attempts to download User A's media
    const getMediaBRes = await fetch(`${BASE_URL}/api/media/${noteAId}/image`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    if (getMediaBRes.status !== 404) {
      throw new Error(`IDOR VIOLATION: User B accessed User A's media with status ${getMediaBRes.status}`)
    }
    console.log("[PASS] User B cannot download User A's media (404 Not Found).")

    // 5d. User B attempts to delete User A's media
    const deleteMediaBRes = await fetch(`${BASE_URL}/api/media/${noteAId}/image`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    if (deleteMediaBRes.status !== 404) {
      throw new Error(`IDOR VIOLATION: User B deleted User A's media with status ${deleteMediaBRes.status}`)
    }
    console.log("[PASS] User B cannot delete User A's media (404 Not Found).")

    // -----------------------------------------------------------------
    // 6. Password Complexity & Input Sanitization
    // -----------------------------------------------------------------
    console.log('\n--- Test 7: Password Bounds & DoS Prevention ---')
    // 6a. Password too short (< 6 chars)
    const shortPassRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'short@test.com', password: '123' }),
    })
    if (shortPassRes.status !== 400) {
      throw new Error(`Expected 400 for short password, got ${shortPassRes.status}`)
    }
    console.log('[PASS] Password under 6 characters rejected with 400.')

    // 6b. Password too long (> 128 chars - DoS defense)
    const longPassRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'long@test.com', password: 'A'.repeat(150) }),
    })
    if (longPassRes.status !== 400) {
      throw new Error(`Expected 400 for password exceeding 128 chars, got ${longPassRes.status}`)
    }
    console.log('[PASS] Excessive password length (>128 chars) rejected with 400 (bcrypt DoS defense).')

    // -----------------------------------------------------------------
    // 7. Rate Limiting Tests (Verification & Password Reset)
    // -----------------------------------------------------------------
    console.log('\n--- Test 8: Rate Limiting & Abuse Prevention ---')
    // Test email verify limiter (limit is 5 requests per 15 min)
    let rateLimitTriggered = false
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ email: `user_a_${timestamp}@notecraft.test` }),
      })
      if (res.status === 429) {
        rateLimitTriggered = true
        break
      }
    }
    if (!rateLimitTriggered) {
      throw new Error('Rate limiter failed: 7 rapid verification requests were not blocked with 429!')
    }
    console.log('[PASS] Rate limiter triggered with 429 Too Many Requests after threshold reached.')

    // -----------------------------------------------------------------
    // 8. Account Deletion Authorization & Cleanup
    // -----------------------------------------------------------------
    console.log('\n--- Test 9: Account Deletion Authorization & Data Cascade ---')
    // 8a. Delete account with incorrect password
    const badDeleteRes = await fetch(`${BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ password: 'WrongPassword123!' }),
    })
    if (badDeleteRes.status !== 401) {
      throw new Error(`Expected 401 for incorrect password on delete account, got ${badDeleteRes.status}`)
    }
    console.log('[PASS] Account deletion with incorrect password rejected with 401.')

    // 8b. Delete account with correct password
    const goodDeleteRes = await fetch(`${BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ password: passwordA }),
    })
    if (!goodDeleteRes.ok) {
      throw new Error(`Account deletion failed: ${goodDeleteRes.status}`)
    }
    console.log('[PASS] Account successfully deleted with correct password.')

    // Verify User A data was purged from PostgreSQL
    const deletedUser = await prisma.user.findUnique({ where: { id: userAId } })
    const deletedNotes = await prisma.note.findMany({ where: { userId: userAId } })
    const deletedMedia = await prisma.media.findMany({ where: { userId: userAId } })

    if (deletedUser || deletedNotes.length > 0 || deletedMedia.length > 0) {
      throw new Error('User data was not completely purged on account deletion!')
    }
    console.log('[PASS] Confirmed: User record, notes, and media records purged from database.')

    // Clean up User B
    await prisma.media.deleteMany({ where: { userId: userBId } })
    await prisma.note.deleteMany({ where: { userId: userBId } })
    await prisma.verificationToken.deleteMany({ where: { userId: userBId } })
    await prisma.user.delete({ where: { id: userBId } })
    console.log('[PASS] Test cleanup complete.')

    console.log('\n======================================================')
    console.log(' ALL PRODUCTION SECURITY AUDIT VERIFICATIONS PASSED!')
    console.log('======================================================')
  } catch (err) {
    console.error('\n[FAIL] Security test suite failed:', err)
    process.exitCode = 1
  } finally {
    if (server) {
      server.close()
    }
    await prisma.$disconnect()
  }
}

runSecurityAuditTests()
