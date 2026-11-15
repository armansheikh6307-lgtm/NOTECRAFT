import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Lock, User, Cloud, ArrowRight, ShieldCheck, Check, KeyRound } from 'lucide-react'
import type { AuthUser, ToastMessage } from './types'
import { apiLogin, apiSignup, apiForgotPassword, apiResetPassword } from './api'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: AuthUser, token: string, shouldImport: boolean) => void
  localNotesCount: number
  onToast: (message: string, kind?: ToastMessage['kind']) => void
  initialMode?: 'login' | 'signup' | 'forgot' | 'reset'
  resetToken?: string
}

export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  localNotesCount,
  onToast,
  initialMode = 'login',
  resetToken = '',
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [tokenInput, setTokenInput] = useState(resetToken)
  const [shouldImport, setShouldImport] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  useEffect(() => {
    if (initialMode) setMode(initialMode)
    if (resetToken) setTokenInput(resetToken)
  }, [initialMode, resetToken])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    const trimmedEmail = email.trim()

    if (mode === 'forgot') {
      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setErrorMessage('Please enter a valid email address.')
        return
      }
      setLoading(true)
      try {
        const msg = await apiForgotPassword(trimmedEmail)
        setInfoMessage(msg)
        onToast(msg, 'info')
      } catch (err: unknown) {
        const error = err as Error
        setErrorMessage(error.message || 'Failed to request password reset.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (mode === 'reset') {
      const activeToken = tokenInput.trim()
      if (!activeToken) {
        setErrorMessage('Please provide the reset token.')
        return
      }
      if (!password || password.length < 6) {
        setErrorMessage('New password must be at least 6 characters long.')
        return
      }
      setLoading(true)
      try {
        const msg = await apiResetPassword(activeToken, password)
        onToast(msg, 'success')
        setMode('login')
        setPassword('')
        setInfoMessage('Password reset successfully. Please log in with your new password.')
      } catch (err: unknown) {
        const error = err as Error
        setErrorMessage(error.message || 'Failed to reset password.')
      } finally {
        setLoading(false)
      }
      return
    }

    // Login or Signup
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        const res = await apiSignup(trimmedEmail, password, name.trim() || undefined)
        onToast(`Account created! Welcome, ${res.user.name || res.user.email}.`, 'success')
        onSuccess(res.user, res.token, shouldImport && localNotesCount > 0)
      } else {
        const res = await apiLogin(trimmedEmail, password)
        onToast(`Welcome back, ${res.user.name || res.user.email}!`, 'success')
        onSuccess(res.user, res.token, shouldImport && localNotesCount > 0)
      }
      onClose()
    } catch (err: unknown) {
      const error = err as Error
      setErrorMessage(error.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="auth-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <motion.div
          className="auth-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        <motion.div
          className="auth-modal-card"
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <button
            className="auth-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>

          <div className="auth-modal-header">
            <div className="auth-brand-badge">
              <span className="brand-mark"><span /><span /></span>
              <Cloud size={16} className="auth-cloud-icon" />
            </div>
            <h2 id="auth-modal-title">
              {mode === 'login' && 'Sign in to NOTECRAFT'}
              {mode === 'signup' && 'Create your account'}
              {mode === 'forgot' && 'Reset your password'}
              {mode === 'reset' && 'Set new password'}
            </h2>
            <p className="auth-modal-subtitle">
              {mode === 'login' && 'Access your saved notes and sync seamlessly across devices.'}
              {mode === 'signup' && 'Back up your thoughts and synchronize notes securely with PostgreSQL.'}
              {mode === 'forgot' && 'Enter your email to receive a secure password reset link.'}
              {mode === 'reset' && 'Enter your token and choose a new secure password.'}
            </p>
          </div>

          {(mode === 'login' || mode === 'signup') && (
            <div className="auth-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab ${mode === 'login' ? 'is-active' : ''}`}
                onClick={() => {
                  setMode('login')
                  setErrorMessage(null)
                  setInfoMessage(null)
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-tab ${mode === 'signup' ? 'is-active' : ''}`}
                onClick={() => {
                  setMode('signup')
                  setErrorMessage(null)
                  setInfoMessage(null)
                }}
              >
                Create Account
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="auth-error-banner" role="alert">
              <span>{errorMessage}</span>
            </div>
          )}

          {infoMessage && (
            <div className="auth-info-banner" role="status">
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'signup' && (
              <div className="auth-field">
                <label htmlFor="auth-name">Name (optional)</label>
                <div className="auth-input-wrap">
                  <User size={16} className="auth-input-icon" />
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    placeholder="e.g. Armaan"
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
              <div className="auth-field">
                <label htmlFor="auth-email">Email address</label>
                <div className="auth-input-wrap">
                  <Mail size={16} className="auth-input-icon" />
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    placeholder="you@example.com"
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {mode === 'reset' && (
              <div className="auth-field">
                <label htmlFor="auth-reset-token">Reset Token</label>
                <div className="auth-input-wrap">
                  <KeyRound size={16} className="auth-input-icon" />
                  <input
                    id="auth-reset-token"
                    type="text"
                    value={tokenInput}
                    placeholder="Paste reset token here"
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
              <div className="auth-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="auth-password">{mode === 'reset' ? 'New Password' : 'Password'}</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                      onClick={() => {
                        setMode('forgot')
                        setErrorMessage(null)
                        setInfoMessage(null)
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="auth-input-wrap">
                  <Lock size={16} className="auth-input-icon" />
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    placeholder="••••••••"
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            {mode === 'signup' && localNotesCount > 0 && (
              <label className="auth-import-checkbox">
                <input
                  type="checkbox"
                  checked={shouldImport}
                  onChange={(e) => setShouldImport(e.target.checked)}
                  disabled={loading}
                />
                <span className="checkbox-custom">
                  {shouldImport && <Check size={12} />}
                </span>
                <span className="import-label">
                  Import my <strong>{localNotesCount} local note{localNotesCount > 1 ? 's' : ''}</strong> to this account
                </span>
              </label>
            )}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              <span>
                {loading
                  ? 'Please wait…'
                  : mode === 'login'
                    ? 'Sign In'
                    : mode === 'signup'
                      ? 'Create Account'
                      : mode === 'forgot'
                        ? 'Send Reset Link'
                        : 'Reset Password'}
              </span>
              {!loading && <ArrowRight size={16} />}
            </button>

            {mode === 'forgot' && (
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '12px', cursor: 'pointer', marginTop: '6px' }}
                onClick={() => {
                  setMode('login')
                  setErrorMessage(null)
                  setInfoMessage(null)
                }}
              >
                ← Back to Sign In
              </button>
            )}
          </form>

          <div className="auth-modal-footer">
            <span className="security-note">
              <ShieldCheck size={14} /> Password is encrypted and sessions are signed with JWT.
            </span>
            <button
              type="button"
              className="auth-guest-btn"
              onClick={onClose}
            >
              Continue in offline guest mode
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
