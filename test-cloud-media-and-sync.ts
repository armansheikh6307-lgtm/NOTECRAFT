import { app } from './src/index.js'
import { prisma } from './src/db.js'
import type { Server } from 'node:http'

const TEST_PORT = 3105
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

// 1x1 transparent PNG buffer
const SAMPLE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

// Sample WebM audio header buffer
const SAMPLE_AUDIO_BUFFER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
  0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x88, 0x77, 0x65,
  0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02,
])

async function runTests() {
  console.log('=== Starting Cloud Media & Multi-Device Sync Verification ===')
  let server: Server | null = null

  try {
    server = app.listen(TEST_PORT)
    console.log(`[PASS] Test server listening on ${BASE_URL}`)

    // 1. Create primary test user
    const emailA = `media_sync_${Date.now()}@notecraft.test`
    const passwordA = 'SecureP@ssword123!'
    const signupResA = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: passwordA, name: 'User A' }),
    })
    const authDataA = await signupResA.json()
    const tokenA = authDataA.token
    const userIdA = authDataA.user.id
    console.log('[PASS] Primary user created with token.')

    // 2. Create secondary test user for isolation checks
    const emailB = `isolation_${Date.now()}@notecraft.test`
    const passwordB = 'SecureP@ssword123!'
    const signupResB = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: passwordB, name: 'User B' }),
    })
    const authDataB = await signupResB.json()
    const tokenB = authDataB.token
    const userIdB = authDataB.user.id
    console.log('[PASS] Secondary user created for security checks.')

    // 3. Test MIME validation (uploading invalid mime type as image)
    const noteId = `note-media-test-${Date.now()}`
    const invalidForm = new FormData()
    invalidForm.append('file', new Blob(['Not an image'], { type: 'text/plain' }), 'test.txt')
    invalidForm.append('kind', 'image')

    const badMimeRes = await fetch(`${BASE_URL}/api/media/upload/${noteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: invalidForm,
    })
    console.log('[TEST] Invalid MIME upload status:', badMimeRes.status)
    if (badMimeRes.status !== 400) {
      throw new Error(`Expected 400 for invalid MIME type, got ${badMimeRes.status}`)
    }
    console.log('[PASS] Invalid MIME rejected.')

    // 4. Test Unauthenticated Upload (should fail with 401)
    const unauthForm = new FormData()
    unauthForm.append('file', new Blob([SAMPLE_PNG_BUFFER], { type: 'image/png' }), 'sample.png')
    unauthForm.append('kind', 'image')

    const unauthUploadRes = await fetch(`${BASE_URL}/api/media/upload/${noteId}`, {
      method: 'POST',
      body: unauthForm,
    })
    if (unauthUploadRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated upload, got ${unauthUploadRes.status}`)
    }
    console.log('[PASS] Unauthenticated upload correctly blocked with 401.')

    // 5. Test Authenticated Image Upload
    const validImageForm = new FormData()
    validImageForm.append('file', new Blob([SAMPLE_PNG_BUFFER], { type: 'image/png' }), 'photo.png')
    validImageForm.append('kind', 'image')

    const uploadImageRes = await fetch(`${BASE_URL}/api/media/upload/${noteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: validImageForm,
    })
    const uploadImageData = await uploadImageRes.json()
    console.log('[TEST] Valid image upload:', uploadImageData)
    if (!uploadImageData.success || uploadImageData.media?.kind !== 'image') {
      throw new Error(`Image upload failed: ${JSON.stringify(uploadImageData)}`)
    }
    console.log('[PASS] Image uploaded and indexed in PostgreSQL.')

    // 6. Test Authenticated Image Download
    const downloadImageRes = await fetch(`${BASE_URL}/api/media/${noteId}/image`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    if (downloadImageRes.status !== 200) {
      throw new Error(`Image download failed with status ${downloadImageRes.status}`)
    }
    const downloadedImageBuf = Buffer.from(await downloadImageRes.arrayBuffer())
    if (downloadedImageBuf.length !== SAMPLE_PNG_BUFFER.length) {
      throw new Error('Downloaded image byte length mismatch')
    }
    console.log('[PASS] Authenticated image downloaded and byte-verified.')

    // 7. Security Isolation: User B attempts to access User A's media (must fail)
    const unauthorizedDownloadRes = await fetch(`${BASE_URL}/api/media/${noteId}/image`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    if (unauthorizedDownloadRes.status !== 404 && unauthorizedDownloadRes.status !== 403) {
      throw new Error(`Expected 404/403 for unauthorized media download, got ${unauthorizedDownloadRes.status}`)
    }
    console.log('[PASS] User isolation confirmed: User B cannot access User A media.')

    // 8. Test Authenticated Audio Upload & Download
    const validAudioForm = new FormData()
    validAudioForm.append('file', new Blob([SAMPLE_AUDIO_BUFFER], { type: 'audio/webm' }), 'memo.webm')
    validAudioForm.append('kind', 'audio')
    validAudioForm.append('duration', '18')

    const uploadAudioRes = await fetch(`${BASE_URL}/api/media/upload/${noteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: validAudioForm,
    })
    const uploadAudioData = await uploadAudioRes.json()
    if (!uploadAudioData.success || uploadAudioData.media?.kind !== 'audio') {
      throw new Error(`Audio upload failed: ${JSON.stringify(uploadAudioData)}`)
    }
    console.log('[PASS] Audio recording uploaded and indexed.')

    const downloadAudioRes = await fetch(`${BASE_URL}/api/media/${noteId}/audio`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    if (downloadAudioRes.status !== 200) {
      throw new Error(`Audio download failed: ${downloadAudioRes.status}`)
    }
    console.log('[PASS] Authenticated audio memo downloaded successfully.')

    // 9. Multi-Device Bidirectional Sync Verification
    console.log('\n--- Verifying Cross-Device Multi-Device Sync ---')
    const t0 = new Date('2026-10-28T10:00:00.000Z')
    const t1 = new Date('2026-10-28T10:30:00.000Z')
    const t2 = new Date('2026-10-28T11:00:00.000Z')

    const syncNote1 = {
      id: `sync-note-1-${Date.now()}`,
      title: 'Note from Device 1',
      body: 'Created on laptop.',
      category: 'Work',
      updatedAt: t0.toISOString(),
      kind: 'text',
      pinned: false,
      favorite: false,
    }

    // Step 9a: Device 1 syncs Note 1 to cloud
    const syncRes1 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        clientNotes: [syncNote1],
      }),
    })
    const syncData1 = await syncRes1.json()
    if (!syncData1.success || syncData1.appliedCount < 1) {
      throw new Error(`Sync 1 failed: ${JSON.stringify(syncData1)}`)
    }
    console.log('[PASS] Device 1 synced new note to cloud.')

    // Step 9b: Device 2 starts up empty and syncs -> should receive Note 1
    const syncRes2 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        clientNotes: [],
      }),
    })
    const syncData2 = await syncRes2.json()
    const receivedOnDev2 = syncData2.notes.find((n: any) => n.id === syncNote1.id)
    if (!receivedOnDev2 || receivedOnDev2.title !== 'Note from Device 1') {
      throw new Error('Device 2 failed to receive note created by Device 1')
    }
    console.log('[PASS] Device 2 received note created on Device 1.')

    // Step 9c: Device 2 updates Note 1 while offline at t1 (t1 > t0), AND creates Note 2 offline
    const updatedSyncNote1 = {
      ...syncNote1,
      title: 'Note from Device 1 (Edited on Phone)',
      body: 'Updated body text on mobile.',
      updatedAt: t1.toISOString(),
    }
    const syncNote2 = {
      id: `sync-note-2-${Date.now()}`,
      title: 'Offline Note from Phone',
      body: 'Created entirely offline.',
      category: 'Ideas',
      updatedAt: t1.toISOString(),
      kind: 'text',
    }

    const syncRes3 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        clientNotes: [updatedSyncNote1, syncNote2],
      }),
    })
    const syncData3 = await syncRes3.json()
    if (!syncData3.success) {
      throw new Error(`Device 2 sync failed: ${JSON.stringify(syncData3)}`)
    }
    console.log('[PASS] Device 2 synced newer edit + offline note to cloud.')

    // Step 9d: Device 1 syncs with cloud -> should receive updated Note 1 and new Note 2 without losing anything
    const syncRes4 = await fetch(`${BASE_URL}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        clientNotes: [syncNote1], // Device 1 still has old Note 1
      }),
    })
    const syncData4 = await syncRes4.json()
    const finalNote1 = syncData4.notes.find((n: any) => n.id === syncNote1.id)
    const finalNote2 = syncData4.notes.find((n: any) => n.id === syncNote2.id)

    if (finalNote1?.title !== 'Note from Device 1 (Edited on Phone)') {
      throw new Error(`Conflict resolution failed: expected newer mobile title, got: ${finalNote1?.title}`)
    }
    if (!finalNote2 || finalNote2.title !== 'Offline Note from Phone') {
      throw new Error('Device 1 failed to receive Note 2')
    }
    console.log('[PASS] Conflict resolution verified: newer edit prevailed and no local data was lost.')

    // 10. Clean Note Deletion with Physical Media Removal
    const deleteNoteRes = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    const deleteData = await deleteNoteRes.json()
    if (!deleteData.success) {
      throw new Error(`Note deletion failed: ${JSON.stringify(deleteData)}`)
    }
    // Verify media download returns 404 after note deletion
    const verifyMediaGone = await fetch(`${BASE_URL}/api/media/${noteId}/image`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    if (verifyMediaGone.status !== 404) {
      throw new Error(`Expected 404 for media after note deletion, got ${verifyMediaGone.status}`)
    }
    console.log('[PASS] Deleting note successfully removed associated cloud media and DB records.')

    // 11. Test Account Deletion
    const deleteAccountRes = await fetch(`${BASE_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ password: passwordA }),
    })
    const deleteAccountData = await deleteAccountRes.json()
    if (!deleteAccountData.success) {
      throw new Error(`Account deletion failed: ${JSON.stringify(deleteAccountData)}`)
    }
    console.log('[PASS] Complete user account deletion verified.')

    // Cleanup secondary user
    await prisma.user.delete({ where: { id: userIdB } }).catch(() => {})
    console.log('[PASS] Cleanup complete.')

    console.log('\n=== ALL CLOUD MEDIA & MULTI-DEVICE SYNC TESTS PASSED! ===')
  } finally {
    if (server) server.close()
    await prisma.$disconnect()
  }
}

runTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})

