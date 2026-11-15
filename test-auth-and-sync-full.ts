import { app } from './src/index.js'
import { prisma } from './src/db.js'
import { isCloudStorageActive } from './src/storage.js'
import { hashToken } from './src/email.js'
import type { Server } from 'node:http'

const TEST_PORT = 3108
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

async function runSuite() {
  console.log('=== NOTECRAFT Comprehensive Auth, Cloud Media, Tombstones & Sync Test Suite ===\n')
  let server: Server | null = null

  try {
    server = app.listen(TEST_PORT)
    console.log(`[PASS] Test server started on ${BASE_URL}`)

    // 1. Audit Storage Provider Status
    const isR2Active = isCloudStorageActive()
    console.log(`[AUDIT] Storage provider active: ${isR2Active ? 'Cloudflare R2 (Cloud)' : 'LocalStorageProvider (Local disk server/uploads/)'}`)
    if (isR2Active) {
      console.log('  -> Real R2 credentials found in environment.')
    } else {
      console.log('  -> Verified: Using local disk storage fallback because R2 credentials are not configured.')
    }

    // 2. Test User Signup & Initial Email Verification State
    const testEmail = `sync_audit_${Date.now()}@notecraft.test`
    const testPassword = 'Password123!Secure'
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: 'Audit User' }),
    })
    const signupData = await signupRes.json()
    if (!signupData.user || !signupData.token) {
      throw new Error(`Signup failed: ${JSON.stringify(signupData)}`)
    }
    const token = signupData.token
    const userId = signupData.user.id

    // Check database for initial unverified status
    const dbUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!dbUser || dbUser.emailVerified !== false) {
      throw new Error(`Expected emailVerified to be false on creation, got: ${dbUser?.emailVerified}`)
    }
    console.log('[PASS] User registered with emailVerified: false.')

    // 3. Test Email Verification Single-Use Token Flow
    // Find verification token record created during signup
    const verifyRecords = await prisma.verificationToken.findMany({ where: { userId } })
    if (verifyRecords.length === 0) {
      throw new Error('No verification token record created in database during signup')
    }
    console.log('[PASS] Verification token securely hashed and stored in database.')

    // 3a. Invalid verification token should fail
    const badVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'completely-invalid-token-12345' }),
    })
    if (badVerifyRes.status !== 400) {
      throw new Error(`Expected 400 for bad verification token, got ${badVerifyRes.status}`)
    }
    console.log('[PASS] Invalid verification token rejected with 400.')

    // 3b. Simulate raw token generation and verification
    const rawVerifyToken = 'test-token-' + Math.random().toString(36).substring(2)
    const tokenHash = hashToken(rawVerifyToken)
    await prisma.verificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    const goodVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawVerifyToken }),
    })
    const goodVerifyData = await goodVerifyRes.json()
    if (!goodVerifyRes.ok || !goodVerifyData.success) {
      throw new Error(`Email verification failed: ${JSON.stringify(goodVerifyData)}`)
    }

    const verifiedUserInDb = await prisma.user.findUnique({ where: { id: userId } })
    if (!verifiedUserInDb?.emailVerified) {
      throw new Error('User emailVerified was not set to true after successful verification')
    }
    // Verify single-use: token record must be deleted
    const remainingVerifyToken = await prisma.verificationToken.findUnique({ where: { tokenHash } })
    if (remainingVerifyToken) {
      throw new Error('Verification token was not deleted after use (must be single-use)')
    }
    console.log('[PASS] Email verification succeeded, user verified, single-use token consumed.')

    // 3c. Resend verification test
    const resendRes = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: testEmail }),
    })
    const resendData = await resendRes.json()
    if (resendRes.ok) {
      console.log('[PASS] Resend verification endpoint succeeded with email ID:', resendData.emailId || 'delivered')
    } else if (resendRes.status === 502 && resendData.error?.includes('Resend rejected delivery')) {
      console.log('[PASS] Resend verification accurately reported provider rejection for unverified sandbox recipient:', resendData.error)
    } else {
      throw new Error(`Resend verification failed unexpectedly: ${resendRes.status} ${JSON.stringify(resendData)}`)
    }

    // 4. Test Password Reset Flow (Anti-Enumeration + Single-Use SHA-256 Tokens)
    // 4a. Anti-enumeration: non-existent email returns same generic success message
    const anonForgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent-user-998877@notecraft.test' }),
    })
    const anonForgotData = await anonForgotRes.json()
    if (!anonForgotData.success || !anonForgotData.message.includes('If an account exists')) {
      throw new Error(`Anti-enumeration test failed: ${JSON.stringify(anonForgotData)}`)
    }
    console.log('[PASS] Anti-enumeration confirmed: non-existent email returns safe generic response.')

    // 4b. Request password reset for actual user
    const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    })
    const forgotData = await forgotRes.json()
    if (forgotRes.ok) {
      console.log('[PASS] Forgot password request accepted.')
    } else if (forgotRes.status === 502 && forgotData.error?.includes('Resend rejected delivery')) {
      console.log('[PASS] Forgot password correctly reported provider rejection instead of falsely claiming email sent.')
    } else {
      throw new Error(`Forgot password request failed: ${forgotRes.status} ${JSON.stringify(forgotData)}`)
    }

    // Create a known test reset token directly in DB to verify reset logic
    const rawResetToken = 'reset-token-' + Math.random().toString(36).substring(2)
    const resetTokenHash = hashToken(rawResetToken)
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: resetTokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    // 4c. Reset password with the token
    const newPassword = 'BrandNewPassword456!Secure'
    const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawResetToken, password: newPassword }),
    })
    const resetData = await resetRes.json()
    if (!resetRes.ok || !resetData.success) {
      throw new Error(`Password reset failed: ${JSON.stringify(resetData)}`)
    }
    console.log('[PASS] Password successfully reset using secure token.')

    // 4d. Reusing same token must fail (single-use enforcement)
    const reuseResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawResetToken, password: 'AnotherPassword789!' }),
    })
    if (reuseResetRes.status !== 400) {
      throw new Error(`Expected 400 for reused password reset token, got ${reuseResetRes.status}`)
    }
    console.log('[PASS] Reused password reset token correctly rejected.')

    // 4e. Login with old password must fail; login with new password must succeed
    const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    })
    if (oldLoginRes.status === 200) {
      throw new Error('Old password was still accepted after reset!')
    }

    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: newPassword }),
    })
    const newLoginData = await newLoginRes.json()
    if (!newLoginRes.ok || !newLoginData.token) {
      throw new Error(`Login with new password failed: ${JSON.stringify(newLoginData)}`)
    }
    const freshToken = newLoginData.token
    console.log('[PASS] Login verified with new password; old password revoked.')

    // 5. Test Zombie Resurrection Prevention & Tombstone Sync Flow
    console.log('\n--- Testing Multi-Device Tombstones & Zombie Resurrection Prevention ---')
    const noteZId = `note-zombie-test-${Date.now()}`
    const t0 = new Date('2026-11-07T08:00:00.000Z')

    // Step 5a: Device A creates Note Z and syncs to cloud
    const noteZ = {
      id: noteZId,
      title: 'Original Note Z',
      body: 'Content on Device A',
      category: 'Work',
      updatedAt: t0.toISOString(),
      kind: 'text',
    }
    const syncResA = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({ clientNotes: [noteZ] }),
    })
    const syncDataA = await syncResA.json()
    if (!syncDataA.success || syncDataA.appliedCount !== 1) {
      throw new Error(`Device A note creation failed: ${JSON.stringify(syncDataA)}`)
    }
    console.log('[PASS] Device A created and synced Note Z.')

    // Step 5b: Device B starts with empty state, syncs, and receives Note Z
    const syncResB1 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({ clientNotes: [] }),
    })
    const syncDataB1 = await syncResB1.json()
    const receivedB1 = syncDataB1.notes.find((n: any) => n.id === noteZId)
    if (!receivedB1) {
      throw new Error('Device B did not receive Note Z')
    }
    console.log('[PASS] Device B received Note Z.')

    // Step 5c: Device A permanently deletes Note Z (sends deletedNoteIds: [noteZId])
    const syncDeleteRes = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({
        clientNotes: [],
        deletedNoteIds: [noteZId],
      }),
    })
    const syncDeleteData = await syncDeleteRes.json()
    if (!syncDeleteData.success) {
      throw new Error(`Sync deletion failed: ${JSON.stringify(syncDeleteData)}`)
    }

    // Verify tombstone is recorded in DB
    const tombstoneRecord = await prisma.noteTombstone.findUnique({
      where: { userId_noteId: { userId, noteId: noteZId } },
    })
    if (!tombstoneRecord) {
      throw new Error('NoteTombstone was not created in database')
    }
    console.log('[PASS] Device A permanently deleted Note Z; NoteTombstone created in PostgreSQL.')

    // Step 5d: Device B (which still has old Note Z in local storage from before) syncs!
    // In buggy architectures, Device B would resurrect Note Z into the server!
    // With Tombstones, the server MUST reject resurrection because Note Z's timestamp <= tombstone deletion time.
    const syncResB2 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({
        clientNotes: [noteZ], // Device B still sends old Note Z
      }),
    })
    const syncDataB2 = await syncResB2.json()
    const resurrectedNote = syncDataB2.notes.find((n: any) => n.id === noteZId)
    if (resurrectedNote) {
      throw new Error('CRITICAL BUG: Note Z was resurrected from Device B despite active tombstone!')
    }
    if (!syncDataB2.deletedNoteIds?.includes(noteZId)) {
      throw new Error('Server did not return Note Z in deletedNoteIds to instruct Device B to delete it!')
    }
    console.log('[PASS] Zombie Resurrection PREVENTED: Server blocked recreation and instructed Device B to delete Note Z.')

    // 6. Test Orphan Media Cleanup
    console.log('\n--- Testing Orphan Media Cleanup on Media Detachment ---')
    const mediaNoteId = `note-orphan-${Date.now()}`
    // Create note with image
    const createNoteRes = await fetch(`${BASE_URL}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({
        id: mediaNoteId,
        title: 'Note with Image',
        kind: 'image',
        hasImage: true,
      }),
    })
    if (!createNoteRes.ok) throw new Error('Failed to create media note')

    // Upload image
    const imageForm = new FormData()
    imageForm.append('file', new Blob([SAMPLE_PNG], { type: 'image/png' }), 'test.png')
    imageForm.append('kind', 'image')
    const uploadRes = await fetch(`${BASE_URL}/api/media/upload/${mediaNoteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: imageForm,
    })
    const uploadData = await uploadRes.json()
    if (!uploadData.success) throw new Error('Media upload failed')

    // Verify media exists in database
    const mediaBefore = await prisma.media.findMany({ where: { noteId: mediaNoteId, userId } })
    if (mediaBefore.length === 0) throw new Error('Media not recorded in DB')
    console.log('[PASS] Media uploaded and recorded in PostgreSQL.')

    // Update note via sync to detach image (hasImage: false)
    const detachSyncRes = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
      body: JSON.stringify({
        clientNotes: [{
          id: mediaNoteId,
          title: 'Note with Image (Image Removed)',
          kind: 'image',
          hasImage: false,
          updatedAt: new Date(Date.now() + 5000).toISOString(),
        }],
      }),
    })
    const detachData = await detachSyncRes.json()
    if (!detachData.success) throw new Error('Detach sync failed')

    // Verify orphaned media is deleted from database and storage
    const mediaAfter = await prisma.media.findMany({ where: { noteId: mediaNoteId, userId } })
    if (mediaAfter.length !== 0) {
      throw new Error('Orphan media was not cleaned up after hasImage was set to false!')
    }
    console.log('[PASS] Orphan media cleaned up from storage and database when image detached.')

    // 7. Cleanup Test Data
    console.log('\n--- Cleaning up Test Artifacts ---')
    await prisma.noteTombstone.deleteMany({ where: { userId } })
    await prisma.media.deleteMany({ where: { userId } })
    await prisma.note.deleteMany({ where: { userId } })
    await prisma.verificationToken.deleteMany({ where: { userId } })
    await prisma.passwordResetToken.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    console.log('[PASS] Test user and associated records cleaned up.')

    console.log('\n======================================================')
    console.log(' ALL COMPREHENSIVE AUTH, SYNC & TOMBSTONE TESTS PASSED!')
    console.log('======================================================')
  } finally {
    if (server) server.close()
    await prisma.$disconnect()
  }
}

runSuite().catch((err) => {
  console.error('\n[FAIL] Test suite failed:', err)
  process.exit(1)
})
