import React, { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArrowDownToLine,
  BookOpen,
  ChevronRight,
  FolderOpen,
  Heart,
  Home,
  Lightbulb,
  ListFilter,
  LogIn,
  LogOut,
  Mic,
  Moon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AuthUser, PageId } from './types'
import { SearchField } from './components'

export const sidebarItems: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Recently deleted', icon: Trash2 },
]

export interface SidebarProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
  onCreate: () => void
  favoriteCount: number
  user: AuthUser | null
  onOpenAuth: () => void
  onLogout: () => void
  onImportNotes: () => void
  syncState?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  onSync?: () => void
}

export const Sidebar = React.memo(function Sidebar({
  activePage,
  onNavigate,
  onCreate,
  favoriteCount,
  user,
  onOpenAuth,
  onLogout,
  onImportNotes,
  syncState,
  onSync,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClick)
    return () => document.removeEventListener('pointerdown', handleClick)
  }, [menuOpen])

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'NP'

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Guest Mode')

  return (
    <aside className="sidebar">
      <button className="brand-lockup" type="button" onClick={() => onNavigate('home')} aria-label="NOTECRAFT home">
        <span className="brand-mark"><span /><span /></span>
        <span className="brand-word">NOTE<span>CRAFT</span><small>your quiet corner</small></span>
      </button>

      <button className="sidebar-create" type="button" onClick={onCreate}>
        <span className="create-plus"><Plus size={17} /></span>
        <span>New note</span>
        <kbd>⌘ N</kbd>
      </button>

      <div className="sidebar-group">
        <p className="sidebar-label">YOUR SPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {sidebarItems.slice(0, 3).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`side-link ${activePage === id ? 'side-link-active' : ''}`} onClick={() => onNavigate(id)}>
              <Icon size={17} strokeWidth={activePage === id ? 2.1 : 1.7} />
              <span>{label}</span>
              {id === 'favorites' && <span className="side-count">{favoriteCount}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-group sidebar-folders">
        <div className="sidebar-label-row"><p className="sidebar-label">LIBRARY</p></div>
        <button type="button" className={`side-link ${activePage === 'all' ? 'side-link-active' : ''}`} onClick={() => onNavigate('all')}><BookOpen size={17} strokeWidth={1.7} /><span>All notes</span></button>
        <button type="button" className={`side-link ${activePage === 'archive' ? 'side-link-active' : ''}`} onClick={() => onNavigate('archive')}><FolderOpen size={17} strokeWidth={1.7} /><span>Archive</span></button>
        <button type="button" className={`side-link ${activePage === 'trash' ? 'side-link-active' : ''}`} onClick={() => onNavigate('trash')}><Trash2 size={17} strokeWidth={1.7} /><span>Recently deleted</span></button>
      </div>

      <div className="sidebar-spacer" />
      <div className="sidebar-tip">
        <span className="tip-sparkle"><Lightbulb size={15} /></span>
        <p><strong>A little reminder</strong><br />Good ideas like a little room to wander.</p>
      </div>
      <button className={`side-link sidebar-settings ${activePage === 'settings' ? 'side-link-active' : ''}`} type="button" onClick={() => onNavigate('settings')}><Settings size={17} strokeWidth={1.7} /><span>Settings</span><ChevronRight className="sidebar-chevron" size={14} /></button>
      
      <div
        className="profile-row profile-row-clickable"
        ref={menuRef}
        onClick={() => {
          if (!user) {
            onOpenAuth()
          } else {
            setMenuOpen((prev) => !prev)
          }
        }}
        title={user ? 'Account options (click to view)' : 'Sign in to sync with PostgreSQL'}
      >
        <span className="profile-avatar">{initials}</span>
        <span className="profile-copy">
          <strong>{displayName}</strong>
          <small className={user ? 'profile-sync-badge' : 'profile-guest-badge'}>
            {!user
              ? '📱 Guest mode'
              : syncState === 'syncing'
                ? '🔄 Syncing…'
                : syncState === 'offline'
                  ? '⚡ Offline'
                  : syncState === 'error'
                    ? '⚠️ Sync failed'
                    : '☁️ Notes synced · 📱 Media local'}
          </small>
        </span>
        <MoreHorizontal size={17} className="profile-more" />

        {user && menuOpen && (
          <div className="profile-action-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onSync?.()
              }}
            >
              <RotateCcw size={14} /> Sync now
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onImportNotes()
              }}
            >
              <ArrowDownToLine size={14} /> Import local notes to cloud
            </button>
            <button
              type="button"
              role="menuitem"
              className="logout-action"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onLogout()
              }}
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
})

export interface TopbarProps {
  value: string
  onSearch: (query: string) => void
  onCreate: () => void
  onVoice: () => void
  user: AuthUser | null
  onOpenAuth: () => void
  syncState?: 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
  onSync?: () => void
  isDark: boolean
  onToggleTheme: () => void
}

export const Topbar = React.memo(function Topbar({
  value,
  onSearch,
  onCreate,
  onVoice,
  user,
  onOpenAuth,
  syncState,
  onSync,
  isDark,
  onToggleTheme,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>My workspace</span><ChevronRight size={14} /><strong>NOTECRAFT</strong></div>
      <div className="topbar-actions">
        <SearchField
          className="topbar-search"
          value={value}
          placeholder="Find a note…"
          onFocus={() => onSearch(value)}
          onChange={onSearch}
        />
        <button className="topbar-icon-button" type="button" onClick={onVoice} aria-label="Start a voice note" title="Voice note"><Mic size={17} /></button>
        <button
          className="topbar-icon-button topbar-theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun size={17} className="theme-toggle-icon" />
          ) : (
            <Moon size={17} className="theme-toggle-icon" />
          )}
        </button>
        {user ? (
          <button
            type="button"
            className="topbar-user-badge"
            onClick={onSync}
            title={
              syncState === 'offline'
                ? 'Offline mode: changes will sync automatically when reconnected.'
                : syncState === 'error'
                  ? 'Sync failed: click to retry connecting to the cloud.'
                  : syncState === 'syncing'
                    ? 'Syncing changes with cloud…'
                    : `Signed in as ${user.email} · Notes synced with PostgreSQL, media stored locally in IndexedDB (Click to sync now)`
            }
          >
            <ShieldCheck size={14} />
            <span>{user.name || user.email.split('@')[0]}</span>
            <span className="sync-chip" style={{ fontSize: '11px', opacity: 0.85, marginLeft: '4px' }}>
              {syncState === 'syncing'
                ? '🔄 Syncing…'
                : syncState === 'offline'
                  ? '⚡ Offline'
                  : syncState === 'error'
                    ? '⚠️ Sync failed'
                    : '☁️ Notes synced · 📱 Media local'}
            </span>
          </button>
        ) : (
          <button className="topbar-auth-btn" type="button" onClick={onOpenAuth} title="Sign in to sync with PostgreSQL">
            <LogIn size={14} />
            <span>Sign in</span>
          </button>
        )}
        <button className="topbar-new" type="button" onClick={onCreate}><Plus size={16} /><span>New note</span></button>
      </div>
    </header>
  )
})

export const SlidersHorizontalFallback = React.memo(function SlidersHorizontalFallback() {
  return <ListFilter size={17} />
})

export interface MobileDockProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
  onCreate: () => void
  expanded: boolean
  onExpand: () => void
}

export const MobileDock = React.memo(function MobileDock({
  activePage,
  onNavigate,
  onCreate,
  expanded,
  onExpand,
}: MobileDockProps) {
  return (
    <>
      <AnimatePresence>
        {expanded && (
          <motion.div className="dock-more-menu" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <button type="button" onClick={() => onNavigate('voice')}><Mic size={17} />Voice note</button>
            <button type="button" onClick={() => onNavigate('archive')}><Archive size={17} />Archive</button>
            <button type="button" onClick={() => onNavigate('trash')}><Trash2 size={17} />Recently deleted</button>
            <button type="button" onClick={() => onNavigate('settings')}><Settings size={17} />Settings</button>
          </motion.div>
        )}
      </AnimatePresence>
      <nav className="mobile-dock" aria-label="Quick navigation">
        <button type="button" className={activePage === 'home' || activePage === 'all' ? 'dock-item dock-item-active' : 'dock-item'} onClick={() => onNavigate('home')} aria-label="Dashboard"><Home size={19} /></button>
        <button type="button" className={activePage === 'search' ? 'dock-item dock-item-active' : 'dock-item'} onClick={() => onNavigate('search')} aria-label="Search"><Search size={19} /></button>
        <button type="button" className="dock-create" onClick={onCreate} aria-label="Create a new note"><Plus size={22} /></button>
        <button type="button" className={activePage === 'favorites' ? 'dock-item dock-item-active' : 'dock-item'} onClick={() => onNavigate('favorites')} aria-label="Favorites"><Heart size={19} /></button>
        <button type="button" className={expanded || activePage === 'settings' || activePage === 'archive' || activePage === 'trash' || activePage === 'voice' ? 'dock-item dock-item-active' : 'dock-item'} onClick={onExpand} aria-label="More options"><MoreHorizontal size={21} /></button>
      </nav>
    </>
  )
})
