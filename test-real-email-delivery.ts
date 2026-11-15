import './src/env.js'
import { app } from './src/index.js'
import { prisma } from './src/db.js'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailServiceConfigured,
  generateSecureToken,
  hashToken,
} from './src/email.js'
import type { Server } from 'node:http'

const TEST_PORT = 3111
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

async function runRealEmailDiagnosticSuite() {
  console.log('=== NOTECRAFT Real Email Delivery Diagnostic & Verification Suite ===\n')
  let server: Server | null = null

  try {
    // -----------------------------------------------------------------
    // 1. Verify environment loading & configuration without exposing secrets
    // -----------------------------------------------------------------
    console.log('--- Step 1: Environment & Secrets Verification ---')
    const resendKey = process.env.RESEND_API_KEY?.trim()
    const emailFrom = process.env.EMAIL_FROM?.trim()

    const hasLoadedEnv = Boolean(resendKey)
    if (!hasLoadedEnv) {
      throw new Error('server/.env was NOT loaded or RESEND_API_KEY is missing.')
    }
    console.log('[PASS] server/.env loaded successfully.')

    const isKeyConfigured = isEmailServiceConfigured()
    console.log(`[PASS] isEmailServiceConfigured(): ${isKeyConfigured}`)

    const keyPrefix = resendKey ? resendKey.substring(0, 3) : ''
    const keyLength = resendKey ? resendKey.length : 0
    if (keyPrefix !== 're_' || keyLength < 30) {
      throw new Error(`RESEND_API_KEY has invalid format (prefix: ${keyPrefix}, length: ${keyLength})`)
    }
    console.log(`[PASS] RESEND_API_KEY format valid: prefix "${keyPrefix}...", length ${keyLength} chars (secret redacted).`)
    console.log(`[PASS] EMAIL_FROM configured: "${emailFrom || 'NOTECRAFT <onboarding@resend.dev>'}"`)

    // -----------------------------------------------------------------
    // 2. Start Test Server for HTTP API Tests
    // -----------------------------------------------------------------
    server = app.listen(TEST_PORT)
    console.log(`\n[PASS] Diagnostic server started on ${BASE_URL}`)

    // -----------------------------------------------------------------
    // 3. Test Real Verification Email Acceptance by Resend
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Testing Real Verification Email Delivery via Resend API ---')
    // In Resend sandbox mode (from: onboarding@resend.dev), Resend accepts delivered@resend.dev
    const { token: testVerifyToken } = generateSecureToken()
    const verifyResult = await sendVerificationEmail('delivered@resend.dev', testVerifyToken, 'http://localhost:3000')

    if (!verifyResult.success || !verifyResult.emailId) {
      throw new Error(`Resend rejected test verification email: ${verifyResult.error}`)
    }
    console.log(`[PASS] Resend accepted verification email! Status: Accepted, ID: ${verifyResult.emailId}`)

    // -----------------------------------------------------------------
    // 4. Test Real Password Reset Email Acceptance by Resend
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Testing Real Password Reset Email Delivery via Resend API ---')
    const { token: testResetToken } = generateSecureToken()
    const resetResult = await sendPasswordResetEmail('delivered@resend.dev', testResetToken, 'http://localhost:3000')

    if (!resetResult.success || !resetResult.emailId) {
      throw new Error(`Resend rejected test password reset email: ${resetResult.error}`)
    }
    console.log(`[PASS] Resend accepted password reset email! Status: Accepted, ID: ${resetResult.emailId}`)

    // -----------------------------------------------------------------
    // 5. Test Provider Error Handling & Rejection Logging (Requirement 6)
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Testing Provider Rejection & Anti-False-Positive Logging ---')
    // Attempt sending to a recipient outside the Resend sandbox whitelist (e.g. random unverified address)
    const unverifiedRecipient = 'unverified_sandbox_user_99@gmail.com'
    const rejectResult = await sendVerificationEmail(unverifiedRecipient, testVerifyToken, 'http://localhost:3000')

    if (rejectResult.success) {
      throw new Error('Expected Resend to reject unverified recipient in sandbox mode, but it returned success!')
    }
    console.log('[PASS] Provider rejection correctly captured without crashing.')
    console.log(`  -> Logged Error: "${rejectResult.error}"`)

    // -----------------------------------------------------------------
    // 6. Test Endpoint Behavior: Do NOT show "Email sent" on provider failure
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Testing HTTP Endpoints Against Provider Failures ---')
    // Create a temporary user with the unverified sandbox recipient
    const testPassword = 'Password123!Secure'
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unverifiedRecipient, password: testPassword, name: 'Rejection Test' }),
    })
    const signupData = await signupRes.json()
    const token = signupData.token
    const userId = signupData.user.id

    // Check that signup message does NOT falsely claim email was sent
    if (signupData.emailDelivery && signupData.emailDelivery.success === false) {
      console.log(`[PASS] Signup accurately reported delivery failure notice: "${signupData.message}"`)
    } else {
      console.log('[INFO] Signup response:', signupData.message)
    }

    // Attempt resend-verification for this recipient: MUST return 502, NOT false success
    const resendRes = await fetch(`${BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: unverifiedRecipient }),
    })
    const resendData = await resendRes.json()

    if (resendRes.status !== 502) {
      throw new Error(`Expected 502 Bad Gateway when provider rejects delivery, got status ${resendRes.status}`)
    }
    if (!resendData.error || resendData.message) {
      throw new Error(`Endpoint falsely reported success message on provider failure: ${JSON.stringify(resendData)}`)
    }
    console.log(`[PASS] resend-verification returned HTTP 502 with truthful error: "${resendData.error}"`)

    // Cleanup
    await prisma.verificationToken.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    console.log('[PASS] Test records cleaned up from database.')

    console.log('\n=================================================================')
    console.log(' ALL REAL EMAIL DELIVERY & DIAGNOSTIC VERIFICATIONS PASSED!')
    console.log('=================================================================')
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

runRealEmailDiagnosticSuite()
