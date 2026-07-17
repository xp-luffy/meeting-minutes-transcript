# Architecture — Meeting Minutes Transcript

## Stack
- **Frontend:** Next.js 14 (App Router) — hosted on Vercel
- **Database + Storage:** Supabase (Postgres + Storage for file uploads)
- **AI:** OpenAI GPT-4o via server-side API route (key never exposed to client)
- **Export:** `docx` npm package for Word; `@react-pdf/renderer` for PDF
- **Auth (later):** Supabase Auth with RLS owner policies

## What to Build Now vs Later
**Now:** Transcript intake → AI generation → structured draft editor → resolution/action review → export
**Later:** Auth + team workspaces, custom templates, comment threads, action item reminders, audit log viewer

## Key User Action — Step by Step
1. Cosec opens `/meetings/new`, fills meeting metadata, pastes transcript → `POST /api/meetings` saves meeting + transcript rows
2. Clicks **Generate Minutes** → `POST /api/generate` sends transcript to OpenAI, receives structured JSON
3. Server parses JSON, writes `minutes_drafts`, `resolutions`, `action_items` rows with `source`, `confidence`, `review_status`
4. UI loads `/meetings/[id]` — renders draft sections, resolutions list, action items list from DB (not from memory)
5. Cosec edits a section → `PATCH /api/minutes-drafts/[id]` persists change
6. Cosec marks resolutions reviewed, advances status to `reviewed` → DB update
7. Clicks **Export DOCX** → server builds document from DB rows, returns file

## Layer Plan
1. **Data first** — tables + RLS + seed data; all reads/writes go through Supabase
2. **App logic** — CRUD routes, status machine, export builder; core works if AI is disabled
3. **Smart layer** — OpenAI structured extraction on top; every AI value stored with provenance

## Core Without AI
If OpenAI is unavailable, cosecs can manually enter resolutions and action items via the editor. The status workflow, export, and dashboard all function without generation.