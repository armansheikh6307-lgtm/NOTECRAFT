import React, { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Archive,
  AudioLines,
  Check,
  Clock3,
  FileImage,
  FileText,
  Heart,
  MoreHorizontal,
  Pin,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { Note, ToastMessage } from './types'
import { toneClass } from './data'

export const SectionHeading = React.memo(function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string
  title: ReactNode
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {detail && <p className="section-detail">{detail}</p>}
      </div>
      {action}
    </div>
  )
})

export const SearchField = React.memo(function SearchField({
  value,
  onChange,
  onFocus,
  placeholder = 'Search your notes…',
  className = '',
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <label className={`search-field ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="search-glyph">
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.2 4.2" />
      </svg>
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button className="clear-search" type="button" onClick={() => onChange('')} aria-label="Clear search">
          ×
        </button>
      )}
      {!value && <kbd className="search-shortcut">⌘ K</kbd>}
    </label>
  )
})

export const MiniTag = React.memo(function MiniTag({ children }: { children: ReactNode }) {
  return <span className="mini-tag">{children}</span>
})

export const NoteCard = React.memo(function NoteCard({
  note,
  variant = 'grid',
  onOpen,
  onFavorite,
  onPin,
  onArchive,
  onTrash,
  onRestore,
}: {
  note: Note
  variant?: 'grid' | 'row'
  onOpen: (note: Note) => void
  onFavorite?: (note: Note) => void
  onPin?: (note: Note) => void
  onArchive?: (note: Note) => void
  onTrash?: (note: Note) => void
  onRestore?: (note: Note) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLSpanElement>(null)
  const KindIcon = note.kind === 'voice' ? AudioLines : note.kind === 'image' ? FileImage : FileText

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  return (
    <motion.article
      layout
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      className={`note-card ${variant === 'row' ? 'note-card-row' : 'note-card-grid'} ${toneClass[note.tone]}`}
    >
      <div className="note-card-topline">
        <span className="note-kind-icon" aria-label={`${note.kind} note`} title={`${note.kind} note`}>
          <KindIcon size={15} strokeWidth={1.7} />
        </span>
        <div className="note-card-actions">
          {onPin && (
            <button
              className={`subtle-icon ${note.pinned ? 'is-active' : ''}`}
              type="button"
              aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
              title={note.pinned ? 'Unpin note' : 'Pin note'}
              onClick={(event) => {
                event.stopPropagation()
                onPin(note)
              }}
            >
              <Pin size={14} />
            </button>
          )}
          {onFavorite && (
            <button
              className={`subtle-icon favorite-toggle ${note.favorite ? 'is-favorite' : ''}`}
              type="button"
              aria-label={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
              title={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={(event) => {
                event.stopPropagation()
                onFavorite(note)
              }}
            >
              <Heart size={15} fill={note.favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          {(onArchive || onTrash || onRestore) && (
            <span className="note-context-wrap" ref={menuRef}>
              <button className="subtle-icon" type="button" aria-label="More note actions" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open) }}>
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <span className="note-context-menu" role="menu">
                  {onArchive && <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onArchive(note) }}><Archive size={14} /> Move to archive</button>}
                  {onTrash && <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onTrash(note) }}><Trash2 size={14} /> Move to recently deleted</button>}
                  {onRestore && <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onRestore(note) }}><RotateCcw size={14} /> Restore to notes</button>}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      {note.imageUrl ? (
        variant === 'row' && (
          <div className="note-card-row-thumb">
            <img src={note.imageUrl} alt={note.title || 'Visual note'} />
          </div>
        )
      ) : note.hasImage && variant === 'row' ? (
        <div className="note-card-row-thumb note-card-remote-thumb" title="Photo stored locally on origin device">
          <FileImage size={18} />
        </div>
      ) : null}
      <button className="note-card-open" type="button" onClick={() => onOpen(note)}>
        {note.imageUrl ? (
          variant !== 'row' && (
            <div className="note-card-image-box">
              <img src={note.imageUrl} alt={note.title || 'Visual note'} className="note-card-image-thumb" />
            </div>
          )
        ) : note.hasImage && variant !== 'row' ? (
          <div className="note-card-remote-media-badge" title="Photo stored locally on origin device">
            <FileImage size={13} />
            <span>Photo on origin device</span>
          </div>
        ) : null}

        {note.kind === 'voice' && !note.audioUrl && note.hasAudio && (
          <div className="note-card-remote-media-badge note-card-remote-voice" title="Voice recording stored locally on origin device">
            <AudioLines size={13} />
            <span>Voice memo on origin device</span>
          </div>
        )}

        <h3>{note.title || 'Untitled note'}</h3>
        <p>{note.excerpt}</p>
      </button>
      <div className="note-card-footer">
        <div className="note-card-tags">
          {note.tags.slice(0, variant === 'row' ? 2 : 2).map((tag) => <span className="card-tag" key={tag}>{tag}</span>)}
          <span className="category-dot"><i />{note.category}</span>
        </div>
        <span className="note-updated">{note.updatedAt}</span>
      </div>
    </motion.article>
  )
})

export const QuickActionCard = React.memo(function QuickActionCard({
  icon: Icon,
  title,
  detail,
  color,
  onClick,
}: {
  icon: LucideIcon
  title: string
  detail: string
  color: 'blue' | 'violet' | 'green' | 'coral'
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className="quick-action-card"
      type="button"
      onClick={onClick}
    >
      <span className={`quick-action-icon quick-${color}`}><Icon size={19} strokeWidth={1.8} /></span>
      <span className="quick-action-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="quick-action-arrow">↗</span>
    </motion.button>
  )
})

const WAVE_HEIGHTS = [14, 21, 34, 49, 32, 62, 84, 56, 73, 45, 31, 51, 22, 38, 66, 91, 72, 54, 86, 65, 43, 25, 46, 67, 38, 20, 47, 79, 58, 34, 63, 41, 24, 37, 58, 26, 16, 33, 54, 28, 18]

export const Waveform = React.memo(function Waveform({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  return (
    <div className={`waveform ${active ? 'waveform-active' : ''} ${compact ? 'waveform-compact' : ''}`} aria-hidden="true">
      {WAVE_HEIGHTS.map((height, index) => (
        <i key={index} style={{ '--bar-height': `${height}%`, '--bar-index': index } as React.CSSProperties} />
      ))}
    </div>
  )
})

export const EmptyState = React.memo(function EmptyState({
  title,
  detail,
  icon: Icon = FileText,
  action,
}: {
  title: string
  detail: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon size={22} strokeWidth={1.6} /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  )
})

export const ToastStack = React.memo(function ToastStack({
  messages,
  onDismiss,
}: {
  messages: ToastMessage[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {messages.map((toast) => (
        <motion.div
          layout
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          className={`toast toast-${toast.kind}`}
          key={toast.id}
        >
          <span className="toast-check"><Check size={13} /></span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">×</button>
        </motion.div>
      ))}
    </div>
  )
})

export function Timestamp({ children }: { children: ReactNode }) {
  return <span className="timestamp"><Clock3 size={12} />{children}</span>
}

export function NoteMoreButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="subtle-icon" aria-label="More note actions" onClick={onClick}><MoreHorizontal size={17} /></button>
}
