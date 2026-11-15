export type PageId =
  | 'home'
  | 'all'
  | 'editor'
  | 'voice'
  | 'search'
  | 'favorites'
  | 'archive'
  | 'trash'
  | 'settings'

export type NoteCategory = 'Personal' | 'Work' | 'Ideas' | 'Journal' | 'Projects'
export type NoteKind = 'text' | 'voice' | 'image'
export type NoteTone = 'blue' | 'lavender' | 'mint' | 'peach' | 'lemon' | 'lilac'

export interface Note {
  id: string
  title: string
  excerpt: string
  body: string
  tags: string[]
  category: NoteCategory
  tone: NoteTone
  updatedAt: string
  kind: NoteKind
  pinned?: boolean
  favorite?: boolean
  archived?: boolean
  trashed?: boolean
  audioUrl?: string
  audioDuration?: number
  hasAudio?: boolean
  imageUrl?: string
  hasImage?: boolean
  imageFileName?: string
}

export type ToastKind = 'success' | 'info'

export interface ToastMessage {
  id: number
  message: string
  kind: ToastKind
}

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  emailVerified?: boolean
}

