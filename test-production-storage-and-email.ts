import { initializeStorage, UnavailableStorageProvider, LocalStorageProvider, S3StorageProvider } from './src/storage.js'
import { isEmailServiceConfigured, sendVerificationEmail, sendPasswordResetEmail } from './src/email.js'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

async function runProductionTests() {
  console.log('=== Testing Production Storage & Email Security Enforcements ===\n')

  // 1. Test Production Storage Strictness (No silent local fallback)
  console.log('--- Test 1: Production Mode Storage Enforcement ---')
  const originalNodeEnv = process.env.NODE_ENV
  const originalR2Key = process.env.R2_ACCESS_KEY_ID

  try {
    process.env.NODE_ENV = 'production'
    delete process.env.R2_ACCESS_KEY_ID // Ensure credentials missing

    const prodStorage = initializeStorage()
    if (!(prodStorage instanceof UnavailableStorageProvider)) {
      throw new Error('FAIL: In production without R2 credentials, storage silently fell back to local disk!')
    }
    console.log('[PASS] In production mode without R2, silent local disk fallback was BLOCKED.')

    let threwExpectedly = false
    try {
      await prodStorage.save('test-key', Buffer.from('test'))
    } catch (err: any) {
      if (err.message.includes('Cloud storage is unavailable in production')) {
        threwExpectedly = true
      }
    }
    if (!threwExpectedly) {
      throw new Error('FAIL: prodStorage.save did not throw expected UnavailableStorageProvider error!')
    }
    console.log('[PASS] prodStorage operations throw explicit descriptive errors in production.')
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    if (originalR2Key) process.env.R2_ACCESS_KEY_ID = originalR2Key
  }

  // 2. Test Development Mode Local Disk Fallback
  console.log('\n--- Test 2: Development Mode Storage Fallback ---')
  const devStorage = initializeStorage()
  if (!(devStorage instanceof LocalStorageProvider) && !devStorage.isCloud()) {
    throw new Error('FAIL: Development mode should allow LocalStorageProvider fallback when cloud credentials are unset.')
  }
  const testKey = `dev-test-${Date.now()}.txt`
  const testBuf = Buffer.from('NOTECRAFT Local Dev Storage Test')
  await devStorage.save(testKey, testBuf)
  const retrieved = await devStorage.get(testKey)
  if (!retrieved || retrieved.buffer.toString() !== 'NOTECRAFT Local Dev Storage Test') {
    throw new Error('FAIL: Failed to save and retrieve using LocalStorageProvider in dev mode.')
  }
  await devStorage.delete(testKey)
  console.log('[PASS] Local disk storage works correctly and safely for development mode only.')

  // 3. Test Production Email Suppression (No token logging)
  console.log('\n--- Test 3: Production Email Security ---')
  const originalResendKey = process.env.RESEND_API_KEY
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.RESEND_API_KEY

    // Intercept console.log to ensure tokens are NOT printed in production
    let capturedLogs = ''
    const origLog = console.log
    console.log = (...args: any[]) => {
      capturedLogs += args.join(' ')
    }

    const emailResult = await sendVerificationEmail('test@example.com', 'SECRET_TOKEN_12345')
    console.log = origLog

    if (emailResult.success) {
      throw new Error('FAIL: Email should return success: false when provider is unconfigured in production.')
    }
    if (capturedLogs.includes('SECRET_TOKEN_12345')) {
      throw new Error('FAIL: Secret verification token was logged to stdout in production mode!')
    }
    console.log('[PASS] In production mode without provider, email tokens and sensitive content are NEVER logged.')
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    if (originalResendKey) process.env.RESEND_API_KEY = originalResendKey
  }

  // 4. Live Cloudflare R2 Probe (Real external provider test)
  console.log('\n--- Test 4: Live Cloudflare R2 Connectivity Audit ---')
  const r2AccountId = process.env.R2_ACCOUNT_ID?.trim()
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID?.trim()
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const r2Bucket = process.env.R2_BUCKET_NAME?.trim()

  const hasRealR2 = Boolean(
    r2AccountId &&
    r2AccessKey &&
    r2SecretKey &&
    r2Bucket &&
    r2AccessKey !== 'your_r2_access_key_id'
  )

  if (!hasRealR2) {
    console.log('[EXTERNAL PROBE SKIPPED] Real Cloudflare R2 credentials are not configured in server/.env.')
    console.log('  -> Variables required for live R2 test:')
    console.log('     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME')
  } else {
    console.log(`[EXTERNAL PROBE] Testing live Cloudflare R2 bucket: ${r2Bucket}...`)
    try {
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKey!,
          secretAccessKey: r2SecretKey!,
        },
      })
      const probeKey = `test-probe-${Date.now()}.png`
      const sampleBytes = Buffer.from('R2 Probe Data')

      // Put
      await client.send(new PutObjectCommand({ Bucket: r2Bucket, Key: probeKey, Body: sampleBytes, ContentType: 'image/png' }))
      console.log('  -> [PASS] Live upload to R2 succeeded.')

      // Get
      const res = await client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: probeKey }))
      console.log('  -> [PASS] Live download from R2 succeeded.')

      // Delete
      await client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: probeKey }))
      console.log('  -> [PASS] Live deletion from R2 succeeded.')
      console.log('[PASS] Full live Cloudflare R2 test PASSED!')
    } catch (err: any) {
      console.error('  -> [FAIL] Live R2 test failed:', err.message || err)
    }
  }

  // 5. Live Resend Email Delivery Probe (Real external provider test)
  console.log('\n--- Test 5: Live Resend Email Delivery Audit ---')
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const hasRealResend = Boolean(resendKey && resendKey !== 'your_resend_key' && !resendKey.startsWith('re_123'))

  if (!hasRealResend) {
    console.log('[EXTERNAL PROBE SKIPPED] Real Resend API key is not configured in server/.env.')
    console.log('  -> Variable required for live email delivery: RESEND_API_KEY (and optionally EMAIL_FROM)')
  } else {
    console.log('[EXTERNAL PROBE] Testing live Resend email delivery...')
    const result = await sendVerificationEmail('test@resend.dev', 'test-token-probe', 'http://localhost:3000')
    if (result.success && !result.simulated) {
      console.log('[PASS] Live email dispatched successfully via Resend API!')
    } else {
      console.log('[FAIL] Live email dispatch failed.')
    }
  }

  console.log('\n=================================================================')
  console.log(' PRODUCTION ENFORCEMENT & ADAPTER VALIDATION COMPLETED!')
  console.log('=================================================================\n')
}

runProductionTests().catch((err) => {
  console.error('[FAIL] Suite crashed:', err)
  process.exit(1)
})
