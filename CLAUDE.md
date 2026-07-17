# meeting-minutes-transcript

<!-- Managed by Launchpad. Edits here may be overwritten on next sync. -->

## Stack & commands

- Framework: Next.js
- `dev`: `next dev --turbopack`
- `build`: `next build`
- `lint`: `next lint`
- `start`: `next start`

## Architecture

- RLS (row-level security) is being implemented as part of Sprint 4 to enforce data access control at the database level

## Gotchas

- No objective is currently set for this project, requiring clarity on success criteria and prioritization

## Notes

- Project has documentation in place: PRD, architecture docs, and sprint plans available in plan pack
- AGENTS.md (Launchpad memory) was synced in recent commits, indicating documentation update workflows are in place
- Database schema migration was added as part of plan pack documentation commit
- AGENTS.md (Launchpad memory) is actively maintained and synced through the commit workflow
- Sprint 1 completed key infrastructure: database reconciliation, minutes generation engine (core feature), and UI components for meetings/transcripts/drafts
- Vercel deployment is automated and triggers post-push via git integration
- Sprint 2 delivered inline editor, status workflow system, and DOCX/PDF export functionality alongside engine quality improvements
- Sprint 3 scope includes action-items dashboard, attendance editor, regenerate functionality, and activity feed features
- Sprint 4 focus is authentication, roles, and RLS (row-level security) lock-down implementation
- CLAUDE.md (Launchpad memory) was synced in latest commit, confirming documentation is actively maintained
- AGENTS.md was synced in recent commit as part of documentation maintenance workflow
