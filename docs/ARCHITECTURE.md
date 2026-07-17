# Architecture

## Stack
- **Frontend:** Next.js 14 (App Router) on Vercel
- **Database:** Supabase (Postgres + RLS)
- **AI:** OpenAI GPT-4o via server-side API route (key never in client)
- **Export:** `docx` npm package for Word; `@react-pdf/renderer` for PDF

## Key User Action — Transcript → Minutes
1. User fills in meeting details (company, type, date, attendees) → saved to `meetings`
2. User pastes/uploads transcript → saved to `transcripts`
3. Browser calls `/api/generate-minutes` (server route)
4. Server sends transcript + structured prompt to OpenAI
5. Response parsed into: `minutes_drafts.body_html`, `resolutions[]`, `action_items[]` — all written to DB
6. UI renders the draft; confidence flags highlight low-confidence extractions for cosec review
7. Cosec edits inline → PATCH to `minutes_drafts`
8. Status button (draft → reviewed → final) → updates `minutes_drafts.status` + audit log entry
9. Export button streams DOCX/PDF from server

## Now vs Later
**Now:** meetings CRUD, transcript input, AI generation, inline editor, status flow, export, demo seed
**Later:** auth + RLS lockdown, role-gated actions, action item tracker dashboard, team workspaces

## Core Without AI
All meeting, transcript, resolution, and action item data is stored relationally. The editor, status workflow, and export work on any manually typed content — AI is an accelerator, not a dependency.
