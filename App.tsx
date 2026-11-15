import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Keyboard,
  Lightbulb,
  ListFilter,
  Mic,
  Moon,
  MoreHorizontal,
  Palette,
  Pin,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import type { AuthUser, Note, NoteCategory, NoteKind, PageId, ToastMessage } from './types'
import { categories, formatTime, initialNotes } from './data'
import { EmptyState, NoteCard, QuickActionCard, SearchField, SectionHeading, ToastStack } from './components'
import {
  deleteNoteAudio,
  deleteNoteImage,
  deleteNotesMedia,
  getNoteAudio,
  getNoteAudios,
  getNoteImage,
  getNoteImages,
  saveNoteAudio,
  saveNoteImage,
} from './mediaStorage'
import {
  apiDeleteNote,
  apiGetMe,
  apiImportNotes,
  apiResendVerification,
  apiSyncNotes,
  apiVerifyEmail,
  getStoredToken,
  setStoredToken,
} from './api'
import { MobileDock, Sidebar, SlidersHorizontalFallback, Topbar } from './Navigation'

let isScrollTriggerRegistered = false

const AuthModal = React.lazy(() => import('./AuthModal').then((m) => ({ default: m.AuthModal })))
const EditorPage = React.lazy(() => import('./EditorPage').then((m) => ({ default: m.EditorPage })))
const VoicePage = React.lazy(() => import('./VoicePage').then((m) => ({ default: m.VoicePage })))

const prefetchEditor = () => {
  import('./EditorPage').catch(() => {})
}
const prefetchVoice = () => {
  import('./VoicePage').catch(() => {})
}
const prefetchAuthModal = () => {
  import('./AuthModal').catch(() => {})
}

function EditorLoadingFallback() {
  return (
    <div className="page-content editor-page" style={{ opacity: 0.75 }}>
      <div className="editor-toolbar">
        <div className="back-link" style={{ pointerEvents: 'none' }}>
          <span>Loading editor…</span>
        </div>
      </div>
      <div className="editor-layout">
        <article className="editor-sheet" style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="ai-spinner" aria-label="Loading editor" />
        </article>
      </div>
    </div>
  )
}

function VoiceLoadingFallback() {
  return (
    <div className="page-content voice-page" style={{ opacity: 0.75 }}>
      <div className="voice-toolbar">
        <div className="back-link" style={{ pointerEvents: 'none' }}>
          <span>Loading voice studio…</span>
        </div>
      </div>
      <section className="voice-stage" style={{ minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="ai-spinner" aria-label="Loading voice recorder" />
      </section>
    </div>
  )
}

const toneOptions: Note['tone'][] = ['blue', 'lavender', 'mint', 'peach', 'lemon', 'lilac']

type Preferences = {
  reducedMotion: boolean
  notePreviews: boolean
  weeklyNote: boolean
  appearance: 'sky' | 'lilac' | 'dark'
}

const PREFERENCES_STORAGE_KEY = 'notecraft.preferences.v1'

function loadSavedPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const appearance = parsed.appearance === 'dark' ? 'dark' : parsed.appearance === 'lilac' ? 'lilac' : 'sky'
      return {
        reducedMotion: Boolean(parsed.reducedMotion),
        notePreviews: parsed.notePreviews ?? true,
        weeklyNote: Boolean(parsed.weeklyNote),
        appearance,
      }
    }
  } catch {}

  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  return {
    reducedMotion: false,
    notePreviews: true,
    weeklyNote: false,
    appearance: prefersDark ? 'dark' : 'sky',
  }
}

function readSavedNotes(): Note[] {
  try {
    const value = window.localStorage.getItem('notecraft.notes.v1')
    if (value) {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed as Note[]
    }
  } catch {
    // Local storage is optional; the starter notes keep the app usable in private browsing.
  }
  return initialNotes
}

const PENDING_DELETIONS_KEY = 'notecraft.deleted_notes.v1'
function getPendingDeletions(): string[] {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function addPendingDeletion(noteId: string) {
  try {
    const list = getPendingDeletions()
    if (!list.includes(noteId)) {
      list.push(noteId)
      window.localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(list))
    }
  } catch {}
}
function clearPendingDeletions(clearedIds: string[]) {
  try {
    const clearedSet = new Set(clearedIds)
    const list = getPendingDeletions().filter((id) => !clearedSet.has(id))
    window.localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(list))
  } catch {}
}

function makeDraft(kind: NoteKind = 'text'): Note {
  return {
    id: `note-${Date.now()}`,
    title: '',
    excerpt: '',
    body: '',
    tags: kind === 'image' ? ['Photo note'] : [],
    category: 'Personal',
    tone: toneOptions[Math.floor(Math.random() * toneOptions.length)] ?? 'blue',
    updatedAt: 'Just now',
    kind,
  }
}

function matchesQuery(note: Note, query: string): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return false
  return [note.title, note.excerpt, note.body, note.category, ...note.tags]
    .some((value) => value.toLowerCase().includes(term))
}

const Dashboard = React.memo(function Dashboard({
  notes,
  user,
  onOpen,
  onCreate,
  onFavorite,
  onPin,
  onArchive,
  onTrash,
  onBrowse,
}: {
  notes: Note[]
  user: AuthUser | null
  onOpen: (note: Note) => void
  onCreate: (kind: NoteKind) => void
  onFavorite: (note: Note) => void
  onPin: (note: Note) => void
  onArchive: (note: Note) => void
  onTrash: (note: Note) => void
  onBrowse: () => void
}) {
  const [selectedCategory, setSelectedCategory] = useState('All notes')
  const today = useMemo(
    () => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()),
    []
  )
  const visibleNotes = useMemo(() => notes.filter((note) => !note.archived && !note.trashed), [notes])
  const filtered = useMemo(
    () => (selectedCategory === 'All notes' ? visibleNotes : visibleNotes.filter((note) => note.category === selectedCategory)),
    [selectedCategory, visibleNotes]
  )
  const recent = useMemo(
    () => filtered.slice().sort((a, b) => (a.updatedAt === 'Just now' ? -1 : b.updatedAt === 'Just now' ? 1 : 0)).slice(0, 4),
    [filtered]
  )
  const pinned = useMemo(() => visibleNotes.filter((note) => note.pinned).slice(0, 4), [visibleNotes])

  const greetingName = user?.name || (user?.email ? user.email.split('@')[0] : 'User')

  return (
    <div className="page-content dashboard-page">
      <section className="welcome-panel reveal">
        <div className="welcome-copy">
          <p className="eyebrow welcome-date"><span className="live-dot" />{today}</p>
          <h1>Good morning,<br /><em>{greetingName}.</em></h1>
          <p className="welcome-subtitle">Make space for the thoughts you’ll want to keep.</p>
          <div className="welcome-footer"><span className="avatar-stack"><i>A</i><i>M</i><i>+</i></span><span>Your ideas, just where you left them.</span></div>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
          <div className="art-paper art-paper-back"><span /><span /><span /></div>
          <div className="art-paper art-paper-front"><span className="art-sun">✳</span><span /><span /><span /></div>
          <span className="art-star art-star-a">✳</span><span className="art-star art-star-b">·</span><span className="art-dot art-dot-a" /><span className="art-dot art-dot-b" />
        </div>
        <button className="welcome-cta" type="button" onClick={() => onCreate('text')}><Plus size={15} /> Capture a thought <ArrowRight size={14} /></button>
      </section>

      <section className="quick-create-section reveal">
        <div className="section-kicker"><span>THE STARTING POINT</span><span className="kicker-line" /></div>
        <div className="quick-create-grid">
          <QuickActionCard icon={FileText} title="Text note" detail="Write it down" color="blue" onClick={() => onCreate('text')} />
          <QuickActionCard icon={Mic} title="Voice note" detail="Say it as it comes" color="violet" onClick={() => onCreate('voice')} />
          <QuickActionCard icon={ImageIcon} title="Photo note" detail="Save a visual idea" color="green" onClick={() => onCreate('image')} />
          <QuickActionCard icon={Sparkles} title="AI note" detail="A little help, later" color="coral" onClick={() => onCreate('text')} />
        </div>
      </section>

      <div className="home-dashboard-columns">
        <section className="recent-section reveal">
          <SectionHeading eyebrow="A FRESH PAGE" title="Recent notes" detail="The little things on your mind lately." action={<button className="text-link" type="button" onClick={onBrowse}>All notes <ArrowRight size={14} /></button>} />
          <div className="category-filter" role="group" aria-label="Filter notes by category">
            {categories.map((category) => <button key={category} type="button" className={selectedCategory === category ? 'filter-chip filter-chip-active' : 'filter-chip'} onClick={() => setSelectedCategory(category)}>{category}</button>)}
          </div>
          {recent.length ? <div className="recent-note-list">{recent.map((note) => <div className="dashboard-card-reveal" key={note.id}><NoteCard note={note} variant="row" onOpen={onOpen} onFavorite={onFavorite} onArchive={onArchive} onTrash={onTrash} /></div>)}</div> : <EmptyState title="No notes in this corner yet" detail="Try another category, or make the first note." icon={BookOpen} />}
        </section>

        <aside className="pinned-section reveal">
          <SectionHeading eyebrow="KEEP CLOSE" title="Pinned" detail="The ones you come back to." action={<span className="pin-count">{pinned.length.toString().padStart(2, '0')}</span>} />
          {pinned.length ? <div className="pinned-note-grid">{pinned.map((note) => <div className="dashboard-card-reveal" key={note.id}><NoteCard note={note} onOpen={onOpen} onFavorite={onFavorite} onPin={onPin} onArchive={onArchive} onTrash={onTrash} /></div>)}</div> : <EmptyState title="Nothing pinned just yet" detail="Pin a note to keep it within easy reach." icon={Pin} />}
          <div className="thought-card">
            <div className="thought-card-head"><span className="thought-icon"><Lightbulb size={16} /></span><span>AN IDEA TO KEEP</span><MoreHorizontal size={16} /></div>
            <p>“Some things get clearer simply by giving them a place to land.”</p>
            <span className="thought-attribution">A note to self <span>— whenever you need it</span></span>
          </div>
        </aside>
      </div>

      <footer className="dashboard-footer"><span>Made for the thoughts in between.</span><span className="footer-sparkle">✳</span><span>A little more room to think.</span></footer>
    </div>
  )
})

const AllNotesPage = React.memo(function AllNotesPage({
  notes,
  onOpen,
  onFavorite,
  onPin,
  onArchive,
  onTrash,
  onCreate,
}: {
  notes: Note[]
  onOpen: (note: Note) => void
  onFavorite: (note: Note) => void
  onPin: (note: Note) => void
  onArchive: (note: Note) => void
  onTrash: (note: Note) => void
  onCreate: () => void
}) {
  const [selectedCategory, setSelectedCategory] = useState<'All notes' | NoteCategory>('All notes')
  const visibleNotes = useMemo(() => notes.filter((note) => !note.archived && !note.trashed), [notes])
  const filteredNotes = useMemo(
    () => (selectedCategory === 'All notes' ? visibleNotes : visibleNotes.filter((note) => note.category === selectedCategory)),
    [selectedCategory, visibleNotes]
  )

  return (
    <div className="page-content collection-page all-notes-page">
      <div className="collection-hero reveal"><span className="collection-hero-icon"><BookOpen size={19} /></span><p className="eyebrow">YOUR WHOLE STORY</p><h1>All your notes.</h1><p>Every thought you’ve kept, gathered in one place.</p></div>
      <div className="library-toolbar reveal"><span className="library-count">{filteredNotes.length.toString().padStart(2, '0')} {filteredNotes.length === 1 ? 'note' : 'notes'}</span><button className="text-link" type="button" onClick={onCreate}>New note <Plus size={14} /></button></div>
      <div className="category-filter all-notes-filter" role="group" aria-label="Filter all notes by category">
        {categories.map((category) => <button key={category} type="button" className={selectedCategory === category ? 'filter-chip filter-chip-active' : 'filter-chip'} onClick={() => setSelectedCategory(category)}>{category}</button>)}
      </div>
      {filteredNotes.length ? <div className="note-grid library-grid">{filteredNotes.map((note) => <NoteCard key={note.id} note={note} onOpen={onOpen} onFavorite={onFavorite} onPin={onPin} onArchive={onArchive} onTrash={onTrash} />)}</div> : <EmptyState icon={BookOpen} title="A fresh page, whenever you’re ready" detail="Create a note to start gathering your thoughts here." action={<button className="empty-action" type="button" onClick={onCreate}><Plus size={14} /> Make a note</button>} />}
    </div>
  )
})

const SearchPage = React.memo(function SearchPage({
  notes,
  query,
  onQuery,
  onOpen,
  onFavorite,
}: {
  notes: Note[]
  query: string
  onQuery: (value: string) => void
  onOpen: (note: Note) => void
  onFavorite: (note: Note) => void
}) {
  const found = useMemo(
    () => notes.filter((note) => !note.trashed && !note.archived && matchesQuery(note, query)),
    [notes, query]
  )
  const recentDiscoveryNotes = useMemo(
    () => notes.filter((note) => !note.archived && !note.trashed).slice(0, 4),
    [notes]
  )
  const suggestions = useMemo(() => ['Design', 'Weekend', 'Studio', 'Recipes'], [])

  return (
    <div className="page-content collection-page search-page">
      <div className="search-page-hero reveal"><p className="eyebrow">YOUR THOUGHTS, WITHIN REACH</p><h1>Find your <em>thread.</em></h1><p>Search titles, tags, and the little details in between.</p><SearchField className="large-search" value={query} onChange={onQuery} placeholder="What are you looking for?" autoFocus /></div>
      {query.trim() ? (
        <section className="results-section reveal">
          <SectionHeading eyebrow={`${found.length} ${found.length === 1 ? 'NOTE' : 'NOTES'} FOUND`} title={<>A little something on <em>“{query.trim()}”</em></>} action={<span className="sort-button"><ListFilter size={15} /> Best match</span>} />
          {found.length ? <div className="note-grid">{found.map((note) => <NoteCard key={note.id} note={note} onOpen={onOpen} onFavorite={onFavorite} />)}</div> : <EmptyState icon={Search} title="No notes found this time" detail="Try a different word, tag, or category. The right thought is probably nearby." />}
        </section>
      ) : (
        <section className="search-discovery reveal">
          <div className="discovery-card"><span className="discovery-icon"><Clock3 size={16} /></span><p className="eyebrow">A FEW RECENT NOTES</p><div className="search-suggestions">{recentDiscoveryNotes.map((note) => <button type="button" key={note.id} onClick={() => onQuery(note.title)}><span>{note.title}</span><ArrowRight size={14} /></button>)}</div></div>
          <div className="discovery-card tags-discovery"><span className="discovery-icon discovery-tag-icon"><Sparkles size={16} /></span><p className="eyebrow">WANDER BY A TAG</p><div className="suggested-tags">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => onQuery(suggestion)}><span>#</span>{suggestion}</button>)}</div><p className="discovery-footnote">Start with a small detail. See where it takes you.</p></div>
        </section>
      )}
      <div className="search-shortcut-footer"><Keyboard size={14} /> A little shortcut <kbd>⌘ K</kbd><span>takes you here, from anywhere.</span></div>
    </div>
  )
})

const LibraryPage = React.memo(function LibraryPage({
  page,
  notes,
  onOpen,
  onFavorite,
  onPin,
  onRestore,
  onDelete,
  onCreate,
}: {
  page: 'favorites' | 'archive' | 'trash'
  notes: Note[]
  onOpen: (note: Note) => void
  onFavorite: (note: Note) => void
  onPin: (note: Note) => void
  onRestore: (note: Note) => void
  onDelete: (note: Note) => void
  onCreate: () => void
}) {
  const settings = useMemo(() => {
    const configs = {
      favorites: { eyebrow: 'SAVED FOR YOURSELF', title: 'The keepers.', detail: 'The notes you marked to find a little faster.', icon: Heart, list: notes.filter((note) => note.favorite && !note.archived && !note.trashed), empty: 'Nothing tucked away here yet', emptyDetail: 'Tap the little heart on a note to keep it close.' },
      archive: { eyebrow: 'OUT OF SIGHT, NEVER LOST', title: 'A softer shelf.', detail: 'Put away for now, ready whenever you are.', icon: FolderOpen, list: notes.filter((note) => note.archived && !note.trashed), empty: 'Your archive is taking a breath', emptyDetail: 'Archived notes will find a home on this shelf.' },
      trash: { eyebrow: 'A SECOND LOOK', title: 'Recently deleted.', detail: 'Notes stay here until you decide what’s next.', icon: Trash2, list: notes.filter((note) => note.trashed), empty: 'All clear, for now', emptyDetail: 'Deleted notes will rest here until you let them go.' },
    }
    return configs[page]
  }, [page, notes])

  const Icon = settings.icon
  return (
    <div className={`page-content collection-page library-${page}`}>
      <div className="collection-hero reveal"><span className={`collection-hero-icon collection-icon-${page}`}><Icon size={19} /></span><p className="eyebrow">{settings.eyebrow}</p><h1>{settings.title}</h1><p>{settings.detail}</p></div>
      <div className="library-toolbar reveal"><span className="library-count">{settings.list.length.toString().padStart(2, '0')} {settings.list.length === 1 ? 'note' : 'notes'}</span><span className="library-sort"><ListFilter size={14} /> Recently updated <ChevronDown size={13} /></span></div>
      {settings.list.length ? <div className="note-grid library-grid">{settings.list.map((note) => <div className="library-card-wrap" key={note.id}><NoteCard note={note} onOpen={onOpen} onFavorite={page !== 'trash' ? onFavorite : undefined} onPin={page !== 'trash' ? onPin : undefined} />{page === 'trash' ? <div className="trash-actions"><button type="button" onClick={() => onRestore(note)}><RotateCcw size={13} /> Restore</button><button type="button" className="delete-forever" onClick={() => onDelete(note)}><X size={13} /> Delete forever</button></div> : page === 'archive' ? <button className="restore-link" type="button" onClick={() => onRestore(note)}><RotateCcw size={13} /> Move back to notes</button> : null}</div>)}</div> : <EmptyState icon={settings.icon} title={settings.empty} detail={settings.emptyDetail} action={page === 'favorites' ? <button className="empty-action" type="button" onClick={onCreate}><Plus size={14} /> Make a new note</button> : undefined} />}
      {page === 'trash' && <div className="trash-note"><ShieldCheck size={15} /><span>Deleted notes are only stored in this browser preview.</span></div>}
    </div>
  )
})

const ToggleRow = React.memo(function ToggleRow({
  icon: Icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: LucideIcon
  title: string
  detail: string
  checked: boolean
  onChange: () => void
}) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={16} /></span><span className="setting-copy"><strong>{title}</strong><small>{detail}</small></span><button role="switch" aria-checked={checked} type="button" className={`toggle-switch ${checked ? 'toggle-on' : ''}`} onClick={onChange}><i /></button></div>
})

const SettingsPage = React.memo(function SettingsPage({
  preferences,
  onChange,
  notes,
  onToast,
}: {
  preferences: Preferences
  onChange: (patch: Partial<Preferences>) => void
  notes: Note[]
  onToast: (message: string) => void
}) {
  const exportNotes = useCallback(() => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'notecraft-notes.json'
    link.click()
    URL.revokeObjectURL(url)
    onToast('A copy of your notes has been downloaded.')
  }, [notes, onToast])

  return (
    <div className="page-content settings-page">
      <div className="settings-header reveal"><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Small comforts.</h1><p>A few choices to make this space feel like yours.</p></div>
      <div className="settings-layout">
        <div className="settings-main-column">
          <section className="settings-card reveal"><div className="settings-card-heading"><span className="settings-heading-icon"><Palette size={17} /></span><div><h2>The look & feel</h2><p>Choose a quiet corner colour.</p></div></div><div className="appearance-options"><button className={`appearance-option ${preferences.appearance === 'sky' ? 'appearance-selected' : ''}`} type="button" onClick={() => onChange({ appearance: 'sky' })}><span className="appearance-swatch appearance-sky" /><span><strong>Soft blue</strong><small>Just like a clear sky.</small></span>{preferences.appearance === 'sky' && <Check size={15} />}</button><button className={`appearance-option ${preferences.appearance === 'lilac' ? 'appearance-selected' : ''}`} type="button" onClick={() => onChange({ appearance: 'lilac' })}><span className="appearance-swatch appearance-lilac" /><span><strong>Gentle lilac</strong><small>A little evening haze.</small></span>{preferences.appearance === 'lilac' && <Check size={15} />}</button><button className={`appearance-option ${preferences.appearance === 'dark' ? 'appearance-selected' : ''}`} type="button" onClick={() => onChange({ appearance: 'dark' })}><span className="appearance-swatch appearance-dark" /><span><strong>Midnight dark</strong><small>Calm and easy on the eyes.</small></span>{preferences.appearance === 'dark' && <Check size={15} />}</button></div><div className="theme-note">{preferences.appearance === 'dark' ? <Moon size={14} /> : <Sun size={14} />}<span>{preferences.appearance === 'dark' ? 'Restful & dim, by design' : 'Light and airy, by design'}</span></div></section>

          <section className="settings-card reveal"><div className="settings-card-heading"><span className="settings-heading-icon"><SlidersHorizontalFallback /></span><div><h2>Your preferences</h2><p>Little things you can always change.</p></div></div><div className="setting-list"><ToggleRow icon={Lightbulb} title="Note previews" detail="Show a line or two on each note card." checked={preferences.notePreviews} onChange={() => onChange({ notePreviews: !preferences.notePreviews })} /><ToggleRow icon={Bell} title="A weekly nudge" detail="Preview preference only; no reminder is scheduled." checked={preferences.weeklyNote} onChange={() => onChange({ weeklyNote: !preferences.weeklyNote })} /><ToggleRow icon={CircleHelp} title="Reduce motion" detail="Keep movement extra subtle throughout." checked={preferences.reducedMotion} onChange={() => onChange({ reducedMotion: !preferences.reducedMotion })} /></div></section>

          <section className="settings-card reveal"><div className="settings-card-heading"><span className="settings-heading-icon"><Keyboard size={17} /></span><div><h2>A few shortcuts</h2><p>For when your hands are already in the right place.</p></div></div><div className="shortcut-list"><div><span>Search your notes</span><kbd>⌘ K</kbd></div><div><span>Write something new</span><kbd>⌘ N</kbd></div><div><span>Save the current note</span><kbd>⌘ ↵</kbd></div></div></section>
        </div>

        <aside className="settings-side-column"><section className="settings-card privacy-card reveal"><span className="privacy-emblem"><ShieldCheck size={20} /></span><p className="eyebrow">YOUR LITTLE CORNER</p><h2>Private, by default.</h2><p>Notes are saved in this browser’s local storage. No account, server, or syncing is connected in this preview.</p><div className="privacy-detail"><span /><span>Saved on this device</span></div></section><section className="settings-card data-card reveal"><div className="settings-card-heading"><span className="settings-heading-icon"><ArrowDownToLine size={17} /></span><div><h2>Your notes, your copy.</h2><p>Take a copy of the notes saved in this browser.</p></div></div><button className="export-button" type="button" onClick={exportNotes}><ArrowDownToLine size={15} /> Export notes as JSON</button><p className="export-footnote">A small backup you can keep wherever you like.</p></section><div className="help-card reveal"><span><CircleHelp size={16} /></span><div><strong>Just looking around?</strong><p>This is an early frontend preview. Some controls are here as a starting point for what comes next.</p></div></div></aside>
      </div>
      <footer className="settings-version">NOTECRAFT <span>·</span> PHASE 01 <span>·</span> MADE WITH A LITTLE CARE</footer>
    </div>
  )
})

export default function App() {
  const [notes, setNotes] = useState<Note[]>(readSavedNotes)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(getStoredToken)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error' | 'offline'>('idle')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login')
  const [authResetToken, setAuthResetToken] = useState('')
  const [activePage, setActivePage] = useState<PageId>('home')
  const [editing, setEditing] = useState<Note | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [mobileMore, setMobileMore] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadSavedPreferences)
  const contentRef = useRef<HTMLElement>(null)
  const pendingImageBlobRef = useRef<Blob | null>(null)
  const pendingAudioBlobRef = useRef<Blob | null>(null)
  const activeObjectUrlsRef = useRef<Set<string>>(new Set())
  const lastSyncTimeRef = useRef<string | null>(null)

  // Concurrency lock, references, and backoff guards
  const notesRef = useRef<Note[]>(notes)
  notesRef.current = notes
  const userRef = useRef<AuthUser | null>(user)
  userRef.current = user
  const tokenRef = useRef<string | null>(token)
  tokenRef.current = token
  const isSyncingRef = useRef<boolean>(false)
  const syncPromiseRef = useRef<Promise<void> | null>(null)
  const hasRestoredSessionRef = useRef<boolean>(false)
  const lastSyncTimestampRef = useRef<number>(0)
  const consecutiveSyncFailuresRef = useRef<number>(0)

  const addToast = useCallback((message: string, kind: ToastMessage['kind'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((items) => [...items, { id, message, kind }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500)
  }, [])

  // Full Multi-Device Bidirectional Sync function with Concurrency Lock & Tombstones
  const triggerSync = useCallback(async (currentNotes?: Note[], showToast = false): Promise<void> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncState('offline')
      if (showToast) {
        addToast('You are currently offline. Notes are saved locally and will sync when back online.', 'info')
      }
      return
    }

    const activeToken = tokenRef.current || getStoredToken()
    if (!activeToken) {
      setSyncState('idle')
      return
    }

    if (isSyncingRef.current && syncPromiseRef.current) {
      return syncPromiseRef.current
    }

    isSyncingRef.current = true
    setSyncState('syncing')

    const syncWork = (async () => {
      try {
        const notesToSync = currentNotes || notesRef.current
        const pendingDeletions = getPendingDeletions()
        const syncResult = await apiSyncNotes(notesToSync, lastSyncTimeRef.current, activeToken, pendingDeletions)
        lastSyncTimeRef.current = syncResult.serverTime
        lastSyncTimestampRef.current = Date.now()
        consecutiveSyncFailuresRef.current = 0
        clearPendingDeletions(pendingDeletions)

        // 1. Process server deletions / tombstones (e.g. deleted on another device)
        const deletedSet = new Set(Array.isArray(syncResult.deletedNoteIds) ? syncResult.deletedNoteIds : [])
        if (deletedSet.size > 0) {
          deleteNotesMedia(Array.from(deletedSet)).catch(() => {})
        }

        // 2. Process incoming server notes with parallel batch media hydration
        if (Array.isArray(syncResult.notes)) {
          const imageNoteIds = syncResult.notes
            .filter((sn) => sn.kind === 'image' && sn.hasImage)
            .map((sn) => sn.id)
          const voiceNoteIds = syncResult.notes
            .filter((sn) => sn.kind === 'voice' && sn.hasAudio)
            .map((sn) => sn.id)

          const [imageMap, audioMap] = await Promise.all([
            getNoteImages(imageNoteIds),
            getNoteAudios(voiceNoteIds),
          ])

          const mediaUrls: Record<string, { imageUrl?: string; audioUrl?: string }> = {}
          for (const [id, blob] of imageMap.entries()) {
            const url = URL.createObjectURL(blob)
            activeObjectUrlsRef.current.add(url)
            mediaUrls[id] = { imageUrl: url }
          }
          for (const [id, blob] of audioMap.entries()) {
            const url = URL.createObjectURL(blob)
            activeObjectUrlsRef.current.add(url)
            mediaUrls[id] = { ...(mediaUrls[id] || {}), audioUrl: url }
          }

          // Single atomic setNotes update
          setNotes((prevNotes) => {
            const filtered = prevNotes.filter((n) => !deletedSet.has(n.id))
            return syncResult.notes.map((serverNote) => {
              const localExisting = filtered.find((n) => n.id === serverNote.id)
              return {
                ...serverNote,
                imageUrl: mediaUrls[serverNote.id]?.imageUrl || localExisting?.imageUrl,
                audioUrl: mediaUrls[serverNote.id]?.audioUrl || localExisting?.audioUrl,
              }
            })
          })
        } else if (deletedSet.size > 0) {
          setNotes((prevNotes) => prevNotes.filter((n) => !deletedSet.has(n.id)))
        }

        setSyncState('synced')
        if (showToast) {
          addToast('All notes synchronized with cloud.', 'success')
        }
      } catch (err) {
        console.warn('Sync notice:', err)
        consecutiveSyncFailuresRef.current += 1
        setSyncState('error')
        if (showToast) {
          addToast('Sync failed. Please check your network connection.', 'info')
        }
      } finally {
        isSyncingRef.current = false
        syncPromiseRef.current = null
      }
    })()

    syncPromiseRef.current = syncWork
    return syncWork
  }, [addToast])

  // Restore authenticated session and sync cloud notes exactly once on mount
  useEffect(() => {
    if (hasRestoredSessionRef.current) return
    hasRestoredSessionRef.current = true

    let active = true

    const restoreSession = async () => {
      const storedToken = getStoredToken()
      if (!storedToken) return

      try {
        const verifiedUser = await apiGetMe(storedToken)
        if (!active) return

        if (verifiedUser) {
          setUser(verifiedUser)
          setToken(storedToken)
          // Exactly one initial sync after session restoration
          triggerSync(undefined, false)
        } else {
          setToken(null)
          setUser(null)
          setStoredToken(null)
        }
      } catch {
        if (active) {
          setToken(null)
          setUser(null)
          setStoredToken(null)
        }
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [triggerSync])

  // Listen for email verification and password reset links
  useEffect(() => {
    const handleUrlTokens = async () => {
      const hash = window.location.hash || ''
      const search = window.location.search || ''

      let verifyToken: string | null = null
      let resetToken: string | null = null

      if (hash.includes('verify-email')) {
        const match = hash.match(/token=([a-zA-Z0-9_-]+)/)
        if (match) verifyToken = match[1]
      } else if (search.includes('verifyToken')) {
        const params = new URLSearchParams(search)
        verifyToken = params.get('verifyToken')
      }

      if (hash.includes('reset-password')) {
        const match = hash.match(/token=([a-zA-Z0-9_-]+)/)
        if (match) resetToken = match[1]
      } else if (search.includes('resetToken')) {
        const params = new URLSearchParams(search)
        resetToken = params.get('resetToken')
      }

      if (verifyToken) {
        try {
          const msg = await apiVerifyEmail(verifyToken)
          addToast(msg || 'Email verified successfully! Full cloud backup is active.', 'success')
          setUser((prev) => (prev ? { ...prev, emailVerified: true } : prev))
          window.history.replaceState(null, '', window.location.pathname)
        } catch (err: unknown) {
          const error = err as Error
          addToast(error.message || 'Verification token is invalid or expired.', 'info')
        }
      } else if (resetToken) {
        setAuthModalMode('reset')
        setAuthResetToken(resetToken)
        setIsAuthModalOpen(true)
        window.history.replaceState(null, '', window.location.pathname)
      }
    }

    handleUrlTokens()
    window.addEventListener('hashchange', handleUrlTokens)
    return () => window.removeEventListener('hashchange', handleUrlTokens)
  }, [addToast])

  // Periodic background sync every 60 seconds, on tab focus/restore, and network reconnect
  useEffect(() => {
    if (!user || !token) return

    const interval = window.setInterval(() => {
      if (consecutiveSyncFailuresRef.current >= 3) {
        const elapsed = Date.now() - lastSyncTimestampRef.current
        if (elapsed < 300000) return
      }
      triggerSync(undefined, false)
    }, 60000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastSyncTimestampRef.current
        const hasPending = getPendingDeletions().length > 0
        if (elapsed > 30000 || hasPending) {
          triggerSync(undefined, false)
        }
      }
    }

    const onOnline = () => {
      setSyncState('idle')
      triggerSync(undefined, false)
    }

    const onOffline = () => {
      setSyncState('offline')
    }

    window.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [user?.id, token, triggerSync])

  // Hydrate persistent media (images and audio) from IndexedDB whenever notes change without blob URLs
  useEffect(() => {
    let active = true

    const hydrateMedia = async () => {
      const imageNotes = notes.filter((n) => n.kind === 'image' && n.hasImage && !n.imageUrl)
      const voiceNotes = notes.filter((n) => n.kind === 'voice' && (n.hasAudio || n.kind === 'voice') && !n.audioUrl)

      if (!imageNotes.length && !voiceNotes.length) return

      const [imageMap, audioMap] = await Promise.all([
        getNoteImages(imageNotes.map((n) => n.id)),
        getNoteAudios(voiceNotes.map((n) => n.id)),
      ])

      if (!active) return

      const imageUpdates: Record<string, string> = {}
      for (const [id, blob] of imageMap.entries()) {
        const url = URL.createObjectURL(blob)
        activeObjectUrlsRef.current.add(url)
        imageUpdates[id] = url
      }

      const audioUpdates: Record<string, string> = {}
      for (const [id, blob] of audioMap.entries()) {
        const url = URL.createObjectURL(blob)
        activeObjectUrlsRef.current.add(url)
        audioUpdates[id] = url
      }

      if (active && (Object.keys(imageUpdates).length > 0 || Object.keys(audioUpdates).length > 0)) {
        setNotes((items) =>
          items.map((n) => {
            let updated = n
            if (imageUpdates[n.id]) {
              updated = { ...updated, imageUrl: imageUpdates[n.id], hasImage: true }
            }
            if (audioUpdates[n.id]) {
              updated = { ...updated, audioUrl: audioUpdates[n.id], hasAudio: true }
            }
            return updated
          })
        )
      }
    }

    hydrateMedia()

    return () => {
      active = false
    }
  }, [notes])

  // Clean up all generated temporary object URLs on application unmount
  useEffect(() => {
    return () => {
      activeObjectUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* safe cleanup */
        }
      })
      activeObjectUrlsRef.current.clear()
    }
  }, [])

  // Sync to local storage
  useEffect(() => {
    try {
      const cleanNotes = notes.map(({ audioUrl, imageUrl, ...rest }) => rest)
      window.localStorage.setItem('notecraft.notes.v1', JSON.stringify(cleanNotes))
    } catch {
      /* Notes remain in memory if storage is unavailable. */
    }
  }, [notes])

  const handleAuthSuccess = useCallback(async (authUser: AuthUser, authToken: string, shouldImport: boolean) => {
    setUser(authUser)
    setToken(authToken)
    setStoredToken(authToken)
    hasRestoredSessionRef.current = true

    if (shouldImport && notesRef.current.length > 0) {
      try {
        const count = await apiImportNotes(notesRef.current, authToken)
        addToast(`Successfully imported ${count} note(s) to your account.`, 'success')
      } catch (err) {
        console.warn('Import warning:', err)
      }
    }

    // Exactly one sync after successful sign-in
    triggerSync(notesRef.current, false)
  }, [addToast, triggerSync])

  const handleLogout = useCallback(() => {
    setUser(null)
    setToken(null)
    setStoredToken(null)
    setSyncState('idle')
    hasRestoredSessionRef.current = false
    addToast('Logged out. Switched to offline guest mode.', 'info')
  }, [addToast])

  const handleManualImport = useCallback(async () => {
    const activeToken = tokenRef.current
    const activeUser = userRef.current
    if (!activeToken || !activeUser) {
      setAuthModalMode('login')
      setIsAuthModalOpen(true)
      return
    }

    try {
      const count = await apiImportNotes(notesRef.current, activeToken)
      addToast(`Imported and synced ${count} note(s) to PostgreSQL.`, 'success')
      triggerSync(undefined, false)
    } catch {
      addToast('Failed to import notes to cloud. Ensure the backend server is running.', 'info')
    }
  }, [addToast, triggerSync])

  const navigate = useCallback((page: PageId) => {
    setActivePage(page)
    setMobileMore(false)
  }, [])

  const createNote = useCallback((kind: NoteKind = 'text') => {
    if (kind === 'voice') {
      prefetchVoice()
      navigate('voice')
      return
    }
    prefetchEditor()
    pendingImageBlobRef.current = null
    pendingAudioBlobRef.current = null
    setEditing(makeDraft(kind))
    navigate('editor')
    if (kind === 'image') addToast('Select an image from your device to begin your visual note.', 'info')
  }, [addToast, navigate])

  const openNote = useCallback(async (note: Note) => {
    prefetchEditor()
    pendingImageBlobRef.current = null
    pendingAudioBlobRef.current = null
    let target = { ...note, tags: [...note.tags] }

    if (target.kind === 'image' && target.hasImage && !target.imageUrl) {
      const blob = await getNoteImage(target.id)
      if (blob) {
        const url = URL.createObjectURL(blob)
        activeObjectUrlsRef.current.add(url)
        target = { ...target, imageUrl: url, hasImage: true }
      }
    } else if (target.kind === 'voice' && (target.hasAudio || target.kind === 'voice') && !target.audioUrl) {
      const blob = await getNoteAudio(target.id)
      if (blob) {
        const url = URL.createObjectURL(blob)
        activeObjectUrlsRef.current.add(url)
        target = { ...target, audioUrl: url, hasAudio: true }
      }
    }

    setEditing(target)
    navigate('editor')
  }, [navigate])

  const updateDraft = useCallback((patch: Partial<Note>) => {
    setEditing((draft) => (draft ? { ...draft, ...patch } : draft))
  }, [])

  const saveDraft = useCallback(async () => {
    if (!editing || (!editing.title.trim() && !editing.body.trim() && !editing.imageUrl && !editing.audioUrl)) {
      addToast('Add a title, caption, image, or recording before saving.')
      return
    }
    const excerpt = editing.body.trim().replace(/\s+/g, ' ').slice(0, 105)
      || (editing.kind === 'image'
        ? (editing.imageFileName ? `Visual note: ${editing.imageFileName}` : 'A visual note.')
        : editing.kind === 'voice'
          ? `Voice note (${formatTime(editing.audioDuration || 0)})`
          : 'A thought worth keeping.')

    const saved: Note = {
      ...editing,
      title: editing.title.trim()
        || (editing.kind === 'image' ? 'A visual note' : editing.kind === 'voice' ? 'Voice note' : 'Untitled note'),
      excerpt,
      updatedAt: new Date().toISOString(),
    }

    if (saved.kind === 'image') {
      if (pendingImageBlobRef.current) {
        await saveNoteImage(saved.id, pendingImageBlobRef.current)
        saved.hasImage = true
        pendingImageBlobRef.current = null
      } else if (!saved.imageUrl && saved.hasImage) {
        await deleteNoteImage(saved.id)
        saved.hasImage = false
      }
    } else if (saved.kind === 'voice') {
      if (pendingAudioBlobRef.current) {
        await saveNoteAudio(saved.id, pendingAudioBlobRef.current)
        saved.hasAudio = true
        pendingAudioBlobRef.current = null
      } else if (!saved.audioUrl && saved.hasAudio) {
        await deleteNoteAudio(saved.id)
        saved.hasAudio = false
      }
    }

    const updatedList = [saved, ...notesRef.current.filter((note) => note.id !== saved.id)]
    setNotes(updatedList)
    setEditing(null)
    navigate('home')

    if (userRef.current && tokenRef.current) {
      triggerSync(updatedList)
    }

    addToast(
      saved.kind === 'image'
        ? userRef.current
          ? 'Note synced to cloud · Photo stored locally on this device.'
          : 'Visual note and photo saved in this browser.'
        : saved.kind === 'voice'
          ? userRef.current
            ? 'Voice note synced to cloud · Audio stored locally on this device.'
            : 'Voice note and recording saved in this browser.'
          : userRef.current
            ? 'Your note is saved and synced to the cloud.'
            : 'Your note is saved in this browser.',
      'success',
    )
  }, [editing, navigate, triggerSync, addToast])

  const toggleNoteField = useCallback((target: Note, field: 'favorite' | 'pinned') => {
    const updatedVal = !target[field]
    const currentNotes = notesRef.current
    const updated = currentNotes.map((note) =>
      note.id === target.id ? { ...note, [field]: updatedVal, updatedAt: new Date().toISOString() } : note
    )
    setNotes(updated)
    setEditing((draft) => (draft && draft.id === target.id ? { ...draft, [field]: updatedVal } : draft))

    if (userRef.current && tokenRef.current) {
      triggerSync(updated)
    }

    addToast(field === 'favorite' ? target.favorite ? 'Removed from your favorites.' : 'Saved to your favorites.' : target.pinned ? 'Unpinned from your notes.' : 'Pinned for later.', 'success')
  }, [triggerSync, addToast])

  const archiveNote = useCallback((target: Note) => {
    const updated = notesRef.current.map((note) =>
      note.id === target.id ? { ...note, archived: true, trashed: false, pinned: false, updatedAt: new Date().toISOString() } : note
    )
    setNotes(updated)
    if (userRef.current && tokenRef.current) {
      triggerSync(updated)
    }
    addToast('Tucked away in your archive.', 'success')
  }, [triggerSync, addToast])

  const trashNote = useCallback((target: Note) => {
    const updated = notesRef.current.map((note) =>
      note.id === target.id ? { ...note, trashed: true, archived: false, pinned: false, updatedAt: new Date().toISOString() } : note
    )
    setNotes(updated)
    if (userRef.current && tokenRef.current) {
      triggerSync(updated)
    }
    addToast('Moved to recently deleted.', 'success')
  }, [triggerSync, addToast])

  const restoreNote = useCallback((target: Note) => {
    const updated = notesRef.current.map((note) =>
      note.id === target.id ? { ...note, trashed: false, archived: false, updatedAt: new Date().toISOString() } : note
    )
    setNotes(updated)
    if (userRef.current && tokenRef.current) {
      triggerSync(updated)
    }
    addToast('Your note is back with the others.', 'success')
  }, [triggerSync, addToast])

  const permanentlyDelete = useCallback(async (target: Note) => {
    addPendingDeletion(target.id)

    if (target.kind === 'image') {
      await deleteNoteImage(target.id)
    } else if (target.kind === 'voice') {
      await deleteNoteAudio(target.id)
    }

    if (target.imageUrl && target.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.imageUrl)
      activeObjectUrlsRef.current.delete(target.imageUrl)
    }
    if (target.audioUrl && target.audioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.audioUrl)
      activeObjectUrlsRef.current.delete(target.audioUrl)
    }

    const remaining = notesRef.current.filter((note) => note.id !== target.id)
    setNotes(remaining)

    const activeToken = tokenRef.current
    const activeUser = userRef.current
    if (activeUser && activeToken) {
      apiDeleteNote(target.id, activeToken).catch((e) => console.warn('Cloud delete error:', e))
      triggerSync(remaining)
    }

    addToast('The note and its local media were removed.', 'info')
  }, [triggerSync, addToast])

  const startSearch = useCallback((query: string) => {
    setSearchQuery(query)
    navigate('search')
  }, [navigate])

  const preferencesChange = useCallback((patch: Partial<Preferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...patch }
      try {
        window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated))
      } catch {}
      return updated
    })
  }, [])

  const toggleTheme = useCallback(() => {
    const isDark = preferences.appearance === 'dark'
    const nextAppearance: 'dark' | 'sky' = isDark ? 'sky' : 'dark'
    preferencesChange({ appearance: nextAppearance })
  }, [preferences.appearance, preferencesChange])

  useEffect(() => {
    if (preferences.appearance === 'dark') {
      document.documentElement.classList.add('theme-dark')
      document.body.style.backgroundColor = '#0b1120'
    } else {
      document.documentElement.classList.remove('theme-dark')
      document.body.style.backgroundColor = '#f3f7ff'
    }
  }, [preferences.appearance])

  const saveVoiceDraft = useCallback((duration: number, audioUrl?: string | null, audioBlob?: Blob | null) => {
    pendingAudioBlobRef.current = audioBlob ?? null
    if (audioUrl) {
      activeObjectUrlsRef.current.add(audioUrl)
    }
    const voiceNote = makeDraft('voice')
    const formattedDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date())
    voiceNote.title = `Voice note · ${formattedDate}`
    voiceNote.excerpt = `Voice note (${formatTime(duration)})`
    voiceNote.body = `Voice note recorded on ${formattedDate} (${formatTime(duration)}).`
    voiceNote.tags = ['Voice memo']
    voiceNote.audioUrl = audioUrl ?? undefined
    voiceNote.audioDuration = duration
    voiceNote.hasAudio = Boolean(audioBlob || audioUrl)
    setEditing(voiceNote)
    navigate('editor')
    addToast('Voice recording ready in editor. Click "Save note" to store it locally.', 'success')
  }, [navigate, addToast])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const modifier = isMac ? event.metaKey : event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        startSearch(searchQuery)
      }
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        createNote('text')
      }
      if (modifier && event.key === 'Enter' && activePage === 'editor') {
        event.preventDefault()
        saveDraft()
      }
      if (event.key === 'Escape') setMobileMore(false)
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [activePage, createNote, searchQuery, saveDraft, startSearch])

  useEffect(() => {
    const reduced =
      preferences.reducedMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (reduced || !contentRef.current) return

    let active = true
    let cardBatchTriggers: { kill: () => void }[] = []
    let staggerTweens: { kill: () => void }[] = []
    let context: { revert: () => void } | null = null

    const initGsapAnimations = async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ])

        if (!active || !contentRef.current) return

        if (!isScrollTriggerRegistered) {
          gsap.registerPlugin(ScrollTrigger)
          isScrollTriggerRegistered = true
        }

        context = gsap.context(() => {
          const elements = gsap.utils.toArray<HTMLElement>('.reveal', contentRef.current)
          elements.forEach((element, index) => {
            gsap.fromTo(
              element,
              { opacity: 0, y: 17 },
              {
                opacity: 1,
                y: 0,
                duration: 0.62,
                delay: Math.min(index * 0.055, 0.22),
                ease: 'power2.out',
                scrollTrigger: { trigger: element, start: 'top 94%', once: true },
              }
            )
          })

          if (activePage === 'home') {
            const cardGroups = gsap.utils.toArray<HTMLElement>(
              '.dashboard-page .recent-note-list, .dashboard-page .pinned-note-grid',
              contentRef.current,
            )
            cardGroups.forEach((group) => {
              const cards = gsap.utils.toArray<HTMLElement>('.dashboard-card-reveal', group)
              if (!cards.length) return
              gsap.set(cards, { autoAlpha: 0, y: 20, scale: 0.985 })
              cardBatchTriggers.push(
                ...ScrollTrigger.batch(cards, {
                  start: 'top 88%',
                  interval: 0.08,
                  batchMax: 4,
                  once: true,
                  onEnter: (batch) => {
                    staggerTweens.push(
                      gsap.to(batch, {
                        autoAlpha: 1,
                        y: 0,
                        scale: 1,
                        duration: 0.58,
                        stagger: 0.085,
                        ease: 'power3.out',
                        overwrite: 'auto',
                      })
                    )
                  },
                })
              )
            })
          }
        }, contentRef)
      } catch (err) {
        console.warn('GSAP dynamic animation notice:', err)
      }
    }

    initGsapAnimations()

    return () => {
      active = false
      cardBatchTriggers.forEach((trigger) => trigger?.kill?.())
      staggerTweens.forEach((tween) => tween?.kill?.())
      context?.revert?.()
    }
  }, [activePage, preferences.reducedMotion])

  const activeNotes = useMemo(() => notes.filter((note) => !note.trashed && !note.archived), [notes])
  const activeNoteCount = useMemo(() => activeNotes.length, [activeNotes])
  const favoriteCount = useMemo(() => notes.filter((note) => note.favorite && !note.archived && !note.trashed).length, [notes])

  // Stable callbacks for sub-components
  const handleFavorite = useCallback((note: Note) => toggleNoteField(note, 'favorite'), [toggleNoteField])
  const handlePin = useCallback((note: Note) => toggleNoteField(note, 'pinned'), [toggleNoteField])
  const handleBrowseAll = useCallback(() => navigate('all'), [navigate])
  const handleCreateText = useCallback(() => createNote('text'), [createNote])
  const handleVoiceNavigate = useCallback(() => {
    prefetchVoice()
    navigate('voice')
  }, [navigate])
  const handleHomeNavigate = useCallback(() => navigate('home'), [navigate])
  const handleEditorBack = useCallback(() => {
    setEditing(null)
    pendingImageBlobRef.current = null
    pendingAudioBlobRef.current = null
    navigate('home')
  }, [navigate])
  const handleEditorImageBlob = useCallback((blob: Blob | null) => {
    pendingImageBlobRef.current = blob
  }, [])
  const handleEditorAudioBlob = useCallback((blob: Blob | null) => {
    pendingAudioBlobRef.current = blob
  }, [])
  const handleOpenAuthLogin = useCallback(() => {
    prefetchAuthModal()
    setAuthModalMode('login')
    setIsAuthModalOpen(true)
  }, [])
  const handleSyncTrigger = useCallback(() => {
    triggerSync(undefined, true)
  }, [triggerSync])
  const handleToggleMobileMore = useCallback(() => {
    setMobileMore((open) => !open)
  }, [])
  const handleDismissToast = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id))
  }, [])
  const handleCloseAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
    setAuthModalMode('login')
    setAuthResetToken('')
  }, [])

  const pageContent = (() => {
    if (activePage === 'home') {
      return (
        <Dashboard
          notes={activeNotes}
          user={user}
          onOpen={openNote}
          onCreate={createNote}
          onFavorite={handleFavorite}
          onPin={handlePin}
          onArchive={archiveNote}
          onTrash={trashNote}
          onBrowse={handleBrowseAll}
        />
      )
    }
    if (activePage === 'all') {
      return (
        <AllNotesPage
          notes={notes}
          onOpen={openNote}
          onFavorite={handleFavorite}
          onPin={handlePin}
          onArchive={archiveNote}
          onTrash={trashNote}
          onCreate={handleCreateText}
        />
      )
    }
    if (activePage === 'editor') {
      return editing ? (
        <React.Suspense fallback={<EditorLoadingFallback />}>
          <EditorPage
            note={editing}
            onUpdate={updateDraft}
            onSave={saveDraft}
            onBack={handleEditorBack}
            onToast={addToast}
            onImageBlobChange={handleEditorImageBlob}
            onAudioBlobChange={handleEditorAudioBlob}
          />
        </React.Suspense>
      ) : (
        <EmptyState
          title="Choose a note to get started"
          detail="Head back to your notes or make a fresh one."
          action={<button className="empty-action" type="button" onClick={handleCreateText}><Plus size={14} /> New note</button>}
        />
      )
    }
    if (activePage === 'voice') {
      return (
        <React.Suspense fallback={<VoiceLoadingFallback />}>
          <VoicePage
            onFinish={saveVoiceDraft}
            onToast={addToast}
            onBack={handleHomeNavigate}
          />
        </React.Suspense>
      )
    }
    if (activePage === 'search') {
      return (
        <SearchPage
          notes={notes}
          query={searchQuery}
          onQuery={setSearchQuery}
          onOpen={openNote}
          onFavorite={handleFavorite}
        />
      )
    }
    if (activePage === 'favorites' || activePage === 'archive' || activePage === 'trash') {
      return (
        <LibraryPage
          page={activePage}
          notes={notes}
          onOpen={openNote}
          onFavorite={handleFavorite}
          onPin={handlePin}
          onRestore={restoreNote}
          onDelete={permanentlyDelete}
          onCreate={handleCreateText}
        />
      )
    }
    return (
      <SettingsPage
        preferences={preferences}
        onChange={preferencesChange}
        notes={notes}
        onToast={addToast}
      />
    )
  })()

  return (
    <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}>
      <div className={`app-shell ${preferences.appearance === 'lilac' ? 'theme-lilac' : preferences.appearance === 'dark' ? 'theme-dark' : ''} ${preferences.notePreviews ? '' : 'hide-note-previews'}`}>
        <Sidebar
          activePage={activePage}
          onNavigate={navigate}
          onCreate={handleCreateText}
          favoriteCount={favoriteCount}
          user={user}
          onOpenAuth={handleOpenAuthLogin}
          onLogout={handleLogout}
          onImportNotes={handleManualImport}
          syncState={syncState}
          onSync={handleSyncTrigger}
        />
        <div className="app-main">
          {user && user.emailVerified === false && (
            <div className="email-verify-banner" role="status">
              <span>✉️ Please verify your email (<strong>{user.email}</strong>) to secure your account and cloud backup.</span>
              <button
                type="button"
                className="email-resend-btn"
                onClick={async () => {
                  try {
                    const msg = await apiResendVerification(user.email, token)
                    addToast(msg || 'Verification email sent! Check your inbox or dev logs.', 'info')
                  } catch (err: unknown) {
                    const e = err as Error
                    addToast(e.message || 'Failed to resend verification.', 'info')
                  }
                }}
              >
                Resend verification email
              </button>
            </div>
          )}
          <Topbar
            value={searchQuery}
            onSearch={startSearch}
            onCreate={handleCreateText}
            onVoice={handleVoiceNavigate}
            user={user}
            onOpenAuth={handleOpenAuthLogin}
            syncState={syncState}
            onSync={handleSyncTrigger}
            isDark={preferences.appearance === 'dark'}
            onToggleTheme={toggleTheme}
          />
          <main className={`main-content content-${activePage}`} ref={contentRef}>
            <div className="page-heading-mobile"><button type="button" className="mobile-logo" onClick={handleHomeNavigate}><span className="brand-mark"><span /><span /></span> NOTECRAFT</button><span className="mobile-count">{activeNoteCount} notes</span></div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 9 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: preferences.reducedMotion ? 0 : 0.28, ease: 'easeOut' }}
                className="page-transition"
              >
                {pageContent}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <MobileDock activePage={activePage} onNavigate={navigate} onCreate={handleCreateText} expanded={mobileMore} onExpand={handleToggleMobileMore} />
        <ToastStack messages={toasts} onDismiss={handleDismissToast} />
        {isAuthModalOpen && (
          <React.Suspense fallback={null}>
            <AuthModal
              isOpen={isAuthModalOpen}
              onClose={handleCloseAuthModal}
              onSuccess={handleAuthSuccess}
              localNotesCount={notes.length}
              onToast={addToast}
              initialMode={authModalMode}
              resetToken={authResetToken}
            />
          </React.Suspense>
        )}
      </div>
    </MotionConfig>
  )
}