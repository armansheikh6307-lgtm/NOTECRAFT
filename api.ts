import type { AuthUser, Note } from './types'

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as { env?: { VITE_API_BASE?: string } }).env : undefined
export const API_BASE = metaEnv?.VITE_API_BASE?.trim() || 'http://localhost:3001'
const TOKEN_KEY = 'notecraft.auth.token'

export function handleNetworkError(err: unknown, defaultMessage: string): never {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('network error') ||
      msg.includes('load failed') ||
      msg.includes('econnrefused')
    ) {
      throw new Error(
        'Unable to reach the NOTECRAFT server. Please check your network connection and ensure the backend is running on port 3001.'
      )
    }
    throw err
  }
  throw new Error(defaultMessage)
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* safe fallback */
  }
}

function getAuthHeaders(token?: string | null): Record<string, string> {
  const activeToken = token || getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (activeToken) {
    headers.Authorization = `Bearer ${activeToken}`
  }
  return headers
}

export async function apiSignup(
  email: string,
  password: string,
  name?: string
): Promise<{ token: string; user: AuthUser }> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the authentication server.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to create account. Please try again.')
  }
  return data
}

export async function apiLogin(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the authentication server.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Invalid email or password.')
  }
  return data
}

export async function apiGetMe(token?: string | null): Promise<AuthUser | null> {
  const activeToken = token || getStoredToken()
  if (!activeToken) return null

  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: getAuthHeaders(activeToken),
    })
    if (!response.ok) {
      if (response.status === 401) {
        setStoredToken(null)
      }
      return null
    }
    const data = await response.json()
    return data.user || null
  } catch {
    return null
  }
}

export async function apiFetchNotes(token?: string | null): Promise<Note[]> {
  const response = await fetch(`${API_BASE}/api/notes`, {
    headers: getAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch cloud notes (${response.status})`)
  }
  const data = await response.json()
  return data.notes || []
}

export async function apiCreateNote(note: Note, token?: string | null): Promise<Note> {
  const { audioUrl, imageUrl, ...cleanNote } = note
  const response = await fetch(`${API_BASE}/api/notes`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(cleanNote),
  })
  if (!response.ok) {
    throw new Error('Failed to save note to cloud.')
  }
  const data = await response.json()
  return data.note
}

export async function apiUpdateNote(
  id: string,
  patch: Partial<Note>,
  token?: string | null
): Promise<Note> {
  const { audioUrl, imageUrl, ...cleanPatch } = patch
  const response = await fetch(`${API_BASE}/api/notes/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(token),
    body: JSON.stringify(cleanPatch),
  })
  if (!response.ok) {
    throw new Error('Failed to update note in cloud.')
  }
  const data = await response.json()
  return data.note
}

export async function apiDeleteNote(id: string, token?: string | null): Promise<void> {
  const response = await fetch(`${API_BASE}/api/notes/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  })
  if (!response.ok) {
    throw new Error('Failed to delete note from cloud.')
  }
}

export async function apiImportNotes(
  notes: Note[],
  token?: string | null
): Promise<number> {
  const cleanNotes = notes.map(({ audioUrl, imageUrl, ...rest }) => rest)
  const response = await fetch(`${API_BASE}/api/notes/import`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ notes: cleanNotes }),
  })
  if (!response.ok) {
    throw new Error('Failed to import local notes.')
  }
  const data = await response.json()
  return data.importedCount || 0
}

// ----------------- Multi-Device Bidirectional Sync -----------------

export interface SyncResponse {
  notes: Note[]
  deletedNoteIds?: string[]
  storageProvider?: string
  serverTime: string
  appliedCount: number
}

export async function apiSyncNotes(
  clientNotes: Note[],
  lastSyncTime?: string | null,
  token?: string | null,
  deletedNoteIds?: string[]
): Promise<SyncResponse> {
  const cleanNotes = clientNotes.map(({ audioUrl, imageUrl, ...rest }) => rest)
  const response = await fetch(`${API_BASE}/api/sync`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({
      clientNotes: cleanNotes,
      deletedNoteIds: deletedNoteIds || [],
      lastSyncTime: lastSyncTime || null,
    }),
  })
  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`)
  }
  return response.json()
}

// ----------------- Email Verification & Password Reset -----------------

export async function apiForgotPassword(email: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the password reset service.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to process request.')
  }
  return data.message || 'If an account exists, a reset link has been sent.'
}

export async function apiResetPassword(token: string, password: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the password reset service.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to reset password.')
  }
  return data.message || 'Password reset successfully.'
}

export async function apiVerifyEmail(token: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the email verification service.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to verify email.')
  }
  return data.message || 'Email verified successfully.'
}

export async function apiResendVerification(email?: string, token?: string | null): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/resend-verification`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ email }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the email verification service.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to resend verification email.')
  }
  return data.message || 'Verification email sent.'
}

// ----------------- Cloud Media (Upload with Progress & Retry) -----------------

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

export async function apiUploadMedia({
  noteId,
  blob,
  kind,
  duration,
  token,
  onProgress,
  maxRetries = 2,
}: {
  noteId: string
  blob: Blob
  kind: 'image' | 'audio'
  duration?: number
  token?: string | null
  onProgress?: (percentage: number) => void
  maxRetries?: number
}): Promise<void> {
  const activeToken = token || getStoredToken()
  if (!activeToken) {
    throw new Error('Sign in required to upload media to cloud.')
  }

  // Pre-upload validation
  if (kind === 'image' && blob.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image is too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Limit is 10MB.`)
  }
  if (kind === 'audio' && blob.size > MAX_AUDIO_SIZE) {
    throw new Error(`Audio recording is too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Limit is 25MB.`)
  }

  const formData = new FormData()
  const ext = kind === 'image' ? (blob.type.includes('png') ? '.png' : '.jpg') : '.webm'
  const fileName = `${kind}-${noteId}${ext}`
  formData.append('file', blob, fileName)
  formData.append('kind', kind)
  if (duration) {
    formData.append('duration', String(Math.round(duration)))
  }

  let attempt = 0
  while (attempt <= maxRetries) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE}/api/media/upload/${noteId}`)
        xhr.setRequestHeader('Authorization', `Bearer ${activeToken}`)

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100)
              onProgress(percent)
            }
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            let errorMsg = `Upload failed with status ${xhr.status}`
            try {
              const res = JSON.parse(xhr.responseText)
              if (res.error) errorMsg = res.error
            } catch {
              /* ignore parse error */
            }
            reject(new Error(errorMsg))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during media upload.'))
        xhr.ontimeout = () => reject(new Error('Media upload timed out.'))
        xhr.timeout = 45000 // 45 seconds timeout for large media

        xhr.send(formData)
      })
      return
    } catch (err) {
      attempt++
      if (attempt > maxRetries) {
        throw err
      }
      // Exponential backoff wait (500ms, 1500ms)
      await new Promise((r) => setTimeout(r, attempt * 750))
    }
  }
}

export async function apiDownloadMedia(
  noteId: string,
  kind: 'image' | 'audio',
  token?: string | null
): Promise<Blob | null> {
  const activeToken = token || getStoredToken()
  if (!activeToken) return null

  try {
    const response = await fetch(`${API_BASE}/api/media/${noteId}/${kind}`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    })
    if (!response.ok) {
      return null
    }
    return await response.blob()
  } catch {
    return null
  }
}

export async function apiDeleteMedia(
  noteId: string,
  kind: 'image' | 'audio',
  token?: string | null
): Promise<void> {
  const activeToken = token || getStoredToken()
  if (!activeToken) return

  await fetch(`${API_BASE}/api/media/${noteId}/${kind}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${activeToken}`,
    },
  })
}

export async function apiDeleteAccount(password: string, token?: string | null): Promise<void> {
  const activeToken = token || getStoredToken()
  if (!activeToken) {
    throw new Error('Sign in required to delete account.')
  }

  const response = await fetch(`${API_BASE}/api/auth/account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeToken}`,
    },
    body: JSON.stringify({ password }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to delete account. Verify your password.')
  }
}

// ----------------- AI Assistant -----------------

export async function apiAiAssist(
  action: string,
  title?: string,
  content?: string,
  token?: string | null
): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/ai/assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(token),
      },
      body: JSON.stringify({ action, title, content }),
    })
  } catch (err) {
    handleNetworkError(err, 'Failed to connect to the AI assistance service.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate AI response.')
  }
  return data.result || ''
}
