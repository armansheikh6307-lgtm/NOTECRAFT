/**
 * Backwards-compatibility wrapper for imageStorage.
 * All media persistence (images + audio) is managed in mediaStorage.ts.
 */
export {
  saveNoteImage,
  getNoteImage,
  getNoteImages,
  deleteNoteImage,
  saveNoteAudio,
  getNoteAudio,
  getNoteAudios,
  deleteNoteAudio,
  deleteNoteMedia,
  deleteNotesMedia,
  resetDBCache,
} from './mediaStorage'
