# Architecture

## Stack
- **Frontend:** Next.js 14 (App Router) on Vercel
- **Database:** Supabase (Postgres + RLS)
- **AI:** OpenAI GPT-4o via server-side API route (key never in browser)
- **Export:** `docx` npm package + `puppeteer`/`html-pdf` for PDF
- **Storage:** Supabase Storage for uploaded transcript files

## Key User-Action Flow
1. User fills Meeting form → row saved to `meetings`
2. User pastes/uploads transcript → saved to `transcripts`
3. User clicks **Generate Minutes** → Next.js server action calls OpenAI with structured prompt + transcript text
4. Response parsed into: full minutes prose + resolutions array + action items array
5. All three written to DB (`minutes_drafts`, `resolutions`, `action_items`)
6. UI renders editable draft; extracted items shown in side panels
7. User edits → auto-save patches `minutes_drafts.content`
8. User clicks Export → server renders DOCX/PDF and streams download

## Layer Plan
| Layer | v1 | Later |
|---|---|---|
| Data | meetings, transcripts, drafts, resolutions, action items | audit_logs, teams, memberships |
| App Logic | generate, edit, export, status transitions | version history, diff view |
| Smart | GPT-4o minutes generation | fine-tuned model, confidence scoring UI |

## Core Without AI
All CRUD (create meeting, save transcript, edit draft, manage action items) works if the AI route is disabled. The Generate button shows an error; everything else functions.
