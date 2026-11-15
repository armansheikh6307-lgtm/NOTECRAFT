import React, { useRef, useState } from 'react'
import {
  ArrowLeft,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderOpen,
  Heart,
  ImageIcon,
  Lightbulb,
  NotebookPen,
  Palette,
  Pin,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { Note, NoteCategory, ToastKind } from './types'
import { formatTime } from './data'
import { apiAiAssist, getStoredToken } from './api'

const categoryOptions: NoteCategory[] = ['Personal', 'Work', 'Ideas', 'Journal', 'Projects']
const toneOptions: Note['tone'][] = ['blue', 'lavender', 'mint', 'peach', 'lemon', 'lilac']

export interface EditorPageProps {
  note: Note
  onUpdate: (patch: Partial<Note>) => void
  onSave: () => void
  onBack: () => void
  onToast: (message: string, kind?: ToastKind) => void
  onImageBlobChange?: (blob: Blob | null) => void
  onAudioBlobChange?: (blob: Blob | null) => void
}

export const EditorPage = React.memo(function EditorPage({
  note,
  onUpdate,
  onSave,
  onBack,
  onToast,
  onImageBlobChange,
  onAudioBlobChange,
}: EditorPageProps) {
  const [tagDraft, setTagDraft] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      onToast('Please choose a valid image file (JPEG, PNG, WebP, or GIF).', 'info')
      event.target.value = ''
      return
    }

    const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
    if (file.size > MAX_SIZE) {
      onToast(`This image is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Please choose an image under 5MB.`, 'info')
      event.target.value = ''
      return
    }

    if (note.imageUrl && note.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(note.imageUrl)
    }

    const previewUrl = URL.createObjectURL(file)
    const suggestedTitle = (!note.title.trim() || note.title === 'A visual note')
      ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      : note.title

    onUpdate({
      imageUrl: previewUrl,
      hasImage: true,
      imageFileName: file.name,
      title: suggestedTitle,
    })
    onImageBlobChange?.(file)
    onToast('Image attached. You can preview it or add captions before saving.', 'success')
    event.target.value = ''
  }

  const handleRemoveImage = () => {
    if (note.imageUrl && note.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(note.imageUrl)
    }
    onUpdate({
      imageUrl: undefined,
      hasImage: false,
      imageFileName: undefined,
    })
    onImageBlobChange?.(null)
    onToast('Image removed.', 'info')
  }

  const addTag = () => {
    const normalized = tagDraft.trim().replace(/,$/, '')
    if (!normalized) return
    if (!note.tags.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
      onUpdate({ tags: [...note.tags, normalized] })
    }
    setTagDraft('')
  }

  const [activeAiAction, setActiveAiAction] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState<{
    actionId: string
    actionTitle: string
    text: string
  } | null>(null)

  const aiActions: {
    id: 'summarize' | 'improve-writing' | 'extract-tasks' | 'generate-title'
    icon: LucideIcon
    title: string
    hint: string
  }[] = [
    { id: 'summarize', icon: Sparkles, title: 'Summarize', hint: 'Find the heart of it' },
    { id: 'improve-writing', icon: NotebookPen, title: 'Improve writing', hint: 'A clearer, polished draft' },
    { id: 'extract-tasks', icon: Lightbulb, title: 'Extract tasks', hint: 'Actionable to-dos & takeaways' },
    { id: 'generate-title', icon: Star, title: 'Generate title', hint: 'Name what’s here' },
  ]

  const handleAiAction = async (
    actionId: 'summarize' | 'improve-writing' | 'extract-tasks' | 'generate-title',
    actionTitle: string,
  ) => {
    if (!note.body.trim() && !note.title.trim()) {
      onToast('Write a few thoughts or a title first so Gemini has something to work with.', 'info')
      return
    }

    setActiveAiAction(actionId)
    try {
      const activeToken = getStoredToken()
      const text = await apiAiAssist(actionId, note.title, note.body, activeToken)
      if (text) {
        setAiResult({
          actionId,
          actionTitle,
          text: text.trim(),
        })
        onToast(`${actionTitle} generated with Gemini!`, 'success')
      } else {
        onToast('Failed to generate content with Gemini.', 'info')
      }
    } catch (err: unknown) {
      const error = err as Error
      onToast(error.message || 'Could not reach NOTECRAFT AI assistant.', 'info')
    } finally {
      setActiveAiAction(null)
    }
  }

  return (
    <div className="page-content editor-page">
      <div className="editor-toolbar">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back to notes</span>
        </button>
        <div className="editor-toolbar-actions">
          <span className="save-status"><span /> Save to this browser</span>
          <button
            type="button"
            className={`editor-utility ${note.favorite ? 'editor-utility-active' : ''}`}
            onClick={() => onUpdate({ favorite: !note.favorite })}
            aria-label={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
            title="Favorite"
          >
            <Heart size={16} fill={note.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={`editor-utility ${note.pinned ? 'editor-utility-active' : ''}`}
            onClick={() => onUpdate({ pinned: !note.pinned })}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            title="Pin note"
          >
            <Pin size={16} />
          </button>
          <button type="button" className="save-button" onClick={onSave}>
            <Check size={15} /> Save note
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <article className="editor-sheet reveal">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div className="editor-note-topline">
            <span className="note-type-label">
              {note.kind === 'image' ? <ImageIcon size={14} /> : note.kind === 'voice' ? <AudioLines size={14} /> : <NotebookPen size={14} />}
              {' '}
              {note.kind === 'image' ? 'VISUAL NOTE' : note.kind === 'voice' ? 'VOICE NOTE' : 'A NEW NOTE'}
            </span>
            <span className="editor-date"><Clock3 size={13} /> {note.updatedAt}</span>
          </div>

          {note.kind === 'image' && (
            note.imageUrl ? (
              <div className="editor-image-preview-wrap">
                <img src={note.imageUrl} alt={note.title || 'Visual note preview'} className="editor-image-preview" />
                <div className="editor-image-actions">
                  <button type="button" className="editor-image-btn" onClick={() => fileInputRef.current?.click()} title="Replace image">
                    <ImageIcon size={14} /> Replace image
                  </button>
                  <button type="button" className="editor-image-btn editor-image-remove" onClick={handleRemoveImage} title="Remove image">
                    <Trash2 size={14} /> Remove image
                  </button>
                </div>
                {note.imageFileName && <span className="editor-image-filename">{note.imageFileName}</span>}
              </div>
            ) : note.hasImage ? (
              <div className="editor-remote-media-notice">
                <div className="remote-media-header">
                  <span className="remote-media-icon"><ImageIcon size={19} /></span>
                  <div>
                    <strong>Photo stored on origin device</strong>
                    <p>Attached: {note.imageFileName || 'Image attachment'} · Stored in local browser storage on the device where it was captured.</p>
                  </div>
                </div>
                <div className="remote-media-actions">
                  <button type="button" className="editor-image-btn" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon size={14} /> Attach photo from this device
                  </button>
                  <button type="button" className="editor-image-btn editor-image-remove" onClick={handleRemoveImage}>
                    <Trash2 size={14} /> Remove attachment
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="editor-image-dropzone"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              >
                <span className="dropzone-icon"><ImageIcon size={22} /></span>
                <p><strong>Click to select an image from your device</strong></p>
                <small>Supports PNG, JPG, WebP, or GIF (up to 5MB) · Stored locally</small>
              </div>
            )
          )}

          <input
            className="editor-title-input"
            value={note.title}
            placeholder={note.kind === 'image' ? 'Give this visual thought a name…' : 'Give this thought a name…'}
            onChange={(event) => onUpdate({ title: event.target.value })}
            aria-label="Note title"
          />
          <div className="editor-rule"><span /></div>
          <textarea
            className="editor-body-input"
            value={note.body}
            placeholder={note.kind === 'image' ? 'Add captions, stories, or details about this image…' : 'Start anywhere. You can tidy it up later…'}
            onChange={(event) => onUpdate({ body: event.target.value })}
            aria-label="Note content"
            spellCheck
          />
          <div className="editor-footer-row">
            <span>{note.body.trim() ? note.body.trim().split(/\s+/).length : 0} words</span>
            <span>{note.kind === 'image' && note.hasImage ? 'Image attached · Stored locally' : 'Take your time.'}</span>
          </div>
          <div className="editor-metadata">
            <div className="metadata-row">
              <span className="metadata-label"><span className="metadata-icon"><FolderOpen size={15} /></span>Filed under</span>
              <label className="select-wrap">
                <select aria-label="Note category" value={note.category} onChange={(event) => onUpdate({ category: event.target.value as NoteCategory })}>
                  {categoryOptions.map((category) => <option key={category}>{category}</option>)}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
            <div className="metadata-row metadata-tags-row">
              <span className="metadata-label"><span className="metadata-icon"><span className="hash-mark">#</span></span>Little labels</span>
              <div className="tag-editor">
                {note.tags.map((tag) => (
                  <button className="editable-tag" type="button" key={tag} onClick={() => onUpdate({ tags: note.tags.filter((value) => value !== tag) })} title={`Remove ${tag}`}>
                    <span>{tag}</span>
                    <X size={11} />
                  </button>
                ))}
                <input
                  aria-label="Add a tag"
                  placeholder="Add a tag…"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag() } }}
                  onBlur={addTag}
                />
                {note.tags.length > 0 && (
                  <button className="tag-add" type="button" onClick={addTag} aria-label="Add tag">
                    <Plus size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className="metadata-row">
              <span className="metadata-label"><span className="metadata-icon"><Palette size={15} /></span>Page colour</span>
              <div className="tone-picker" role="group" aria-label="Page colour">
                {toneOptions.map((tone) => (
                  <button
                    key={tone}
                    className={`tone-swatch tone-swatch-${tone} ${note.tone === tone ? 'tone-selected' : ''}`}
                    type="button"
                    aria-label={`${tone} note colour`}
                    aria-pressed={note.tone === tone}
                    onClick={() => onUpdate({ tone })}
                  />
                ))}
              </div>
            </div>
          </div>
          {note.kind === 'voice' && (
            <div className="editor-hint editor-voice-hint">
              <AudioLines size={16} />
              <div className="editor-voice-content">
                {note.audioUrl ? (
                  <div className="editor-voice-player-row">
                    <span>Recorded audio ({note.audioDuration ? formatTime(note.audioDuration) : 'saved'}):</span>
                    <audio controls src={note.audioUrl} className="editor-audio-element" />
                    <div className="editor-voice-controls">
                      <small className="editor-voice-disclaimer">
                        Stored locally in this browser using IndexedDB.
                      </small>
                      <button
                        type="button"
                        className="editor-voice-remove-btn"
                        onClick={() => {
                          if (note.audioUrl && note.audioUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(note.audioUrl)
                          }
                          onUpdate({ audioUrl: undefined, hasAudio: false })
                          onAudioBlobChange?.(null)
                          onToast('Audio removed from note draft.', 'info')
                        }}
                        title="Remove audio"
                      >
                        <Trash2 size={13} /> Remove audio
                      </button>
                    </div>
                  </div>
                ) : note.hasAudio ? (
                  <div className="editor-remote-media-notice editor-remote-voice" style={{ margin: '6px 0 0', padding: '10px 12px' }}>
                    <div className="remote-media-header">
                      <span className="remote-media-icon"><AudioLines size={18} /></span>
                      <div>
                        <strong>Voice recording stored on origin device</strong>
                        <p>Duration: {note.audioDuration ? formatTime(note.audioDuration) : 'Audio memo'} · Stored in local browser storage on origin device.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <span>Voice note (No audio recording attached).</span>
                )}
                {!note.audioUrl && !note.hasAudio && (
                  <small className="editor-voice-disclaimer">
                    No persistent audio is attached to this note.
                  </small>
                )}
              </div>
            </div>
          )}
        </article>

        <aside className="editor-assist-column reveal">
          <div className="assist-heading">
            <span className="assist-sparkle"><Sparkles size={15} /></span>
            <div>
              <h2>A little assist</h2>
              <p>Powered by Google Gemini</p>
            </div>
          </div>

          <div className="ai-preview-label">
            <span>AI ACTIONS</span>
            <span>GEMINI ONLINE</span>
          </div>

          <div className="ai-action-list">
            {aiActions.map(({ id, icon: Icon, title, hint }, index) => {
              const isLoading = activeAiAction === id
              return (
                <motion.button
                  whileHover={activeAiAction ? {} : { x: 3 }}
                  type="button"
                  className="ai-action-card"
                  key={id}
                  disabled={Boolean(activeAiAction)}
                  onClick={() => handleAiAction(id, title)}
                >
                  <span className={`ai-action-icon ai-action-${index}`}>
                    <Icon size={17} />
                  </span>
                  <span className="ai-action-copy">
                    <strong>{title}</strong>
                    <small>{isLoading ? 'Thinking with Gemini…' : hint}</small>
                  </span>
                  {isLoading ? (
                    <span className="ai-spinner" aria-label="Loading" />
                  ) : (
                    <ChevronRight size={15} className="ai-action-chevron" />
                  )}
                </motion.button>
              )
            })}
          </div>

          {aiResult && (
            <div className="ai-result-card">
              <div className="ai-result-header">
                <div className="ai-result-badge">
                  <Sparkles size={13} />
                  <span>{aiResult.actionTitle}</span>
                </div>
                <button
                  type="button"
                  className="ai-result-close"
                  onClick={() => setAiResult(null)}
                  title="Dismiss result"
                  aria-label="Dismiss result"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="ai-result-body">
                {aiResult.text}
              </div>

              <div className="ai-result-actions">
                {aiResult.actionId === 'generate-title' ? (
                  <button
                    type="button"
                    className="ai-result-btn ai-result-btn-primary"
                    onClick={() => {
                      const firstTitle = aiResult.text.split('\n')[0].replace(/^[\d.*-]+\s*/, '').trim()
                      onUpdate({ title: firstTitle || aiResult.text })
                      onToast('Note title updated!', 'success')
                      setAiResult(null)
                    }}
                  >
                    Use as title
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ai-result-btn ai-result-btn-primary"
                      onClick={() => {
                        const updated = note.body
                          ? `${note.body}\n\n---\n**${aiResult.actionTitle}:**\n${aiResult.text}`
                          : aiResult.text
                        onUpdate({ body: updated })
                        onToast('Added to note body!', 'success')
                        setAiResult(null)
                      }}
                    >
                      Append to note
                    </button>
                    <button
                      type="button"
                      className="ai-result-btn"
                      onClick={() => {
                        onUpdate({ body: aiResult.text })
                        onToast('Note body updated with AI result.', 'info')
                        setAiResult(null)
                      }}
                    >
                      Replace body
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="ai-result-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(aiResult.text)
                    onToast('Copied to clipboard!', 'success')
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="assist-note">
            <span className="assist-note-icon"><ShieldCheck size={15} /></span>
            <p>Calls run through your secure local backend (port 3001). API keys remain isolated on the server.</p>
          </div>
          <div className="editor-quote">
            <span>“</span>
            <p>Clarity often arrives while you’re writing, not before.</p>
          </div>
        </aside>
      </div>
    </div>
  )
})
