# NOTECRAFT

A Phase 1 frontend for a considered, Apple-inspired notes workspace. It is built with React, TypeScript, Vite, Tailwind CSS, GSAP + ScrollTrigger, Framer Motion, and Lucide React.

## Getting started

```bash
pnpm install
pnpm dev
```

Vite starts on port 3000. To create a production build, run:

```bash
pnpm build
```

## What is included

The responsive workspace includes the dashboard, quick-create flows, an All Notes library with category filters, editable notes, tags and categories, pinned and favorite notes, search, archive, recently deleted, a voice-note interface, and settings. On wider screens the app becomes a sidebar-led desktop workspace; on small screens, navigation moves to a floating bottom dock.

Notes are saved in this browser using local storage. The JSON export downloads a local copy. This project has no application server, account system, database, cloud sync, or real AI integration. AI controls are preview-only. The voice screen uses an animated demo waveform and does not request microphone access or save audio; the image-note flow does not upload images. These boundaries are also called out in the interface.

## Project structure

- `src/App.tsx` contains app navigation, screen composition, and client-side state.
- `src/components.tsx` contains shared note, search, action, empty-state, waveform, and toast components.
- `src/data.ts` and `src/types.ts` define sample notes and the typed UI models.
- `src/styles.css` contains the visual system, responsive layouts, and reduced-motion fallback.
- `public/manus-routes.json` describes the current single-page application route.

The application and interaction states are an initial frontend foundation; data synchronization, microphone capture, image attachments, and AI behavior can be added in a later phase.
