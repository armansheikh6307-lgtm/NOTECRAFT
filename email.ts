import crypto from 'node:crypto'
import nodemailer from 'nodemailer'

export function generateSecureToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  return { token, tokenHash }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex')
}

export function isEmailServiceConfigured(): boolean {
  const hasResend = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_API_KEY !== 'your_resend_key')
  const hasSmtp = Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim())
  return hasResend || hasSmtp
}

export interface EmailDeliveryResult {
  success: boolean
  simulated?: boolean
  emailId?: string
  error?: string
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text: string
}

async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<EmailDeliveryResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim()
  let fromEmail = process.env.EMAIL_FROM?.trim() || 'NOTECRAFT <onboarding@resend.dev>'
  if (!fromEmail.includes('<') && fromEmail.includes('@')) {
    fromEmail = `NOTECRAFT <${fromEmail}>`
  }

  // 1. Resend API
  if (resendApiKey && resendApiKey !== 'your_resend_key') {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html,
          text,
        }),
      })

      const data: any = await response.json().catch(() => null)

      if (!response.ok) {
        const errorDetail = data?.message || data?.name || `HTTP error ${response.status}`
        console.error(`[Email/Resend] Delivery request rejected by provider (HTTP status ${response.status}): ${errorDetail}`)
        return {
          success: false,
          error: `Resend rejected delivery (${response.status}): ${errorDetail}`,
        }
      }

      const emailId = data?.id || 'accepted'
      console.log(`[Email/Resend] Email accepted by Resend! ID: ${emailId} (HTTP ${response.status})`)
      return { success: true, emailId }
    } catch (err: any) {
      const networkError = err.message || String(err)
      console.error('[Email/Resend] Network error communicating with Resend:', networkError)
      return {
        success: false,
        error: `Network error reaching Resend: ${networkError}`,
      }
    }
  }

  // 2. SMTP Transport
  const smtpHost = process.env.SMTP_HOST?.trim()
  const smtpUser = process.env.SMTP_USER?.trim()
  const smtpPass = process.env.SMTP_PASS?.trim()
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)

  if (smtpHost && smtpUser) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      })

      const info = await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        html,
        text,
      })
      const emailId = info.messageId || 'accepted'
      console.log(`[Email/SMTP] Email accepted by SMTP server! MessageId: ${emailId}`)
      return { success: true, emailId }
    } catch (err: any) {
      console.error('[Email/SMTP] Delivery failed:', err.message || err)
      return { success: false, error: `SMTP delivery failed: ${err.message || err}` }
    }
  }

  // 3. Fallback Development Simulation (Safe when email provider not yet configured)
  const isProduction = process.env.NODE_ENV === 'production'
  if (isProduction) {
    console.error('[Email/Production Notice] Transactional email provider (RESEND_API_KEY or SMTP) is not configured. Email delivery suppressed in production.')
    return { success: false, error: 'Transactional email provider is not configured in production.' }
  }

  console.log('\n================== [DEV EMAIL NOTIFICATION] ==================')
  console.log(`To: ${to}`)
  console.log(`From: ${fromEmail}`)
  console.log(`Subject: ${subject}`)
  const sanitizedText = text.replace(/token=[a-zA-Z0-9_-]+/g, 'token=[REDACTED_FOR_SECURITY]')
  console.log(`Body:\n${sanitizedText}`)
  console.log('==============================================================\n')

  return { success: true, simulated: true }
}

export async function sendVerificationEmail(
  to: string,
  token: string,
  appBaseUrl = 'http://localhost:3000'
): Promise<EmailDeliveryResult> {
  const verifyUrl = `${appBaseUrl}#verify-email?token=${token}`
  const subject = 'Verify your NOTECRAFT account'
  const text = `Welcome to NOTECRAFT!\n\nPlease verify your email address by opening the following link:\n${verifyUrl}\n\nThis verification link expires in 24 hours.\nIf you did not sign up for NOTECRAFT, you can safely ignore this email.`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1e293b; line-height: 1.6;">
      <div style="margin-bottom: 24px; text-align: center;">
        <span style="font-size: 20px; font-weight: 700; color: #2563eb; letter-spacing: -0.02em;">NOTECRAFT</span>
      </div>
      <h2 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 12px;">Confirm your email address</h2>
      <p style="font-size: 14px; color: #475569; margin: 0 0 24px;">
        Thank you for joining NOTECRAFT. Click the button below to verify your email address and activate full cloud backup and sync.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        This link will expire in 24 hours. If the button doesn't work, copy and paste this URL into your browser:<br/>
        <a href="${verifyUrl}" style="color: #2563eb; word-break: break-all;">${verifyUrl}</a>
      </p>
    </div>
  `

  return sendEmail({ to, subject, html, text })
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  appBaseUrl = 'http://localhost:3000'
): Promise<EmailDeliveryResult> {
  const resetUrl = `${appBaseUrl}#reset-password?token=${token}`
  const subject = 'Reset your NOTECRAFT password'
  const text = `You requested a password reset for your NOTECRAFT account.\n\nOpen this link to choose a new password:\n${resetUrl}\n\nThis single-use reset link expires in 1 hour.\nIf you did not make this request, you can safely ignore this email; your password remains unchanged.`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1e293b; line-height: 1.6;">
      <div style="margin-bottom: 24px; text-align: center;">
        <span style="font-size: 20px; font-weight: 700; color: #2563eb; letter-spacing: -0.02em;">NOTECRAFT</span>
      </div>
      <h2 style="font-size: 22px; font-weight: 600; color: #0f172a; margin: 0 0 12px;">Reset your password</h2>
      <p style="font-size: 14px; color: #475569; margin: 0 0 24px;">
        We received a request to reset the password for your NOTECRAFT account. Click the button below to choose a new password.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px; display: inline-block;">
          Choose New Password
        </a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        This single-use link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.<br/>
        Direct link: <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
  `

  return sendEmail({ to, subject, html, text })
}
