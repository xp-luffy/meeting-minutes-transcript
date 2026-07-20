# meeting-minutes-transcript

<!-- Managed by Launchpad. Edits here may be overwritten on next sync. -->

## Stack & commands

- Framework: Next.js
- `dev`: `next dev --turbopack`
- `build`: `next build`
- `lint`: `next lint`
- `start`: `next start`

## Decisions

- Vercel build skipping implemented for CLAUDE/AGENTS.md-only commits to prevent runaway Launchpad sync loop cycles
- Vercel builds are skipped for documentation-only commits (claude.md/agents.md changes) to prevent unnecessary build cycles
- V2-2 through V2-4 sprints focused on UI/UX polish, mobile optimization (375px-desktop), performance scaling for 1k-firm simulation, and audit compliance resolution
- V3-4 audit findings resolved with both Opus and Codex code review tools approving deployment (BLOCK -> DEPLOY OK)
- Public demo data is now explicitly marked rather than inferred from NULL owner, making the access control boundary clearer
- Remove demo mode: login is now required, users only see their own work.
- App navigation is hidden from signed-out visitors (auth-gating UI elements)
- Automated 'Verifier' or finality gate added: 'final' status now requires explicit verification step, closing 4 unearned-assurance gaps where items could reach final without proper validation.
- Owner check was split into two distinct concepts: accountability vs traceability. This likely has implications for RLS policies and authentication logic.
- Every export path now includes explicit proof (assertions/validations) to guarantee correctness before delivering output files
- search_path is pinned on person_name_tokens function to prevent schema resolution issues
- Codex concept review completed: two real defects found and concept doc reviewed.

## Architecture

- RLS (row-level security) is being implemented as part of Sprint 4 to enforce data access control at the database level
- Vercel builds are configured to skip on claude.md and agents.md-only commits to prevent launchpad sync loop cycles
- Vercel build skipping is configured to prevent runaway launchpad sync loop cycles when only claude.md or agents.md files change
- V2 architecture established on three core pillars: assurance engine, company memory, and confirmation flow
- V2 deployment complete with all audit findings resolved; project cleared for production across opus and codex implementations
- V3 graph/obligation engine implemented with entities, obligations, conflicts, and people models as foundation for audit system
- Pending state handling for destructive actions is a key ux pattern being refined in the codebase
- Refuse to finalise without proof: the fix for false all-clear (where a meeting could be falsely marked as fully verified) is now paired with a proof gate that prevents finalisation unless actual evidence is present.

## Gotchas

- No objective is currently set for this project, requiring clarity on success criteria and prioritization
- Vercel build skipping is implemented for claude/agents.md-only commits to prevent runaway launchpad sync loop cycles
- Vercel builds are configured to skip for documentation-only commits (claude.md, agents.md) to prevent wasteful deployment cycles from launchpad sync operations
- Recent commits are documentation-only syncs (claude.md, agents.md); no feature development or code changes are happening in current commit cycle
- Recent commits are documentation-only (claude.md sync); no feature development or code changes detected in current cycle
- Recent commits are documentation-only (AGENTS.md sync); no feature development or code changes detected in current commit cycle
- Recent commit is documentation-only (chore: sync CLAUDE.md); no code changes or feature development in current cycle
- Vercel builds are being skipped for claude/agents.md-only commits to prevent launchpad sync loop cycles
- Without an objective set, project prioritization and success criteria remain unclear despite comprehensive roadmap and completed sprints
- Recent commit (chore: sync CLAUDE.md) is documentation-only with no code changes; Vercel builds are configured to skip on claude/agents.md-only commits to prevent sync loops
- Recent commit is documentation-only (claude.md sync) with no code changes or feature work; vercel build skipping is implemented for launchpad sync commits to prevent CI/CD loop cycles
- Recent commit activity shows only documentation maintenance (agents.md sync); no feature development or code changes detected in current commit cycle
- Recent commits show only documentation maintenance (agents.md sync); no active feature development or code changes in current cycle
- Recent commit is chore: sync AGENTS.md only—purely documentation maintenance with no code changes or feature development
- Viewport meta tag fix was critical—mobile breakpoints were inert on real devices despite working in dev, requiring explicit viewport configuration
- No objective currently set—project lacks clarity on success criteria and prioritization despite having a comprehensive roadmap and completed v2 deployment
- Recent commits are purely documentation maintenance (agents.md/claude.md syncs) with no code changes or feature development
- Launchpad bot loop recurring issue - V2 handoff required manual-deploy note to halt runaway syncs despite vercel build skipping being in place
- Launchpad sync loop was previously broken but is now fixed (per commit msg 'Launchpad loop fixed'); vercel build skipping for claude/agents.md-only commits prevents runaway cycles
- Create Meeting UI was missing pending state feedback during submission, causing apparent non-responsiveness; fixed in this commit
- Company creation was failing due to client/server constant boundary issue—now fixed
- Engine strips topic-prefix lead-ins (e.g., 'On the launch timeline, …') from meeting minutes during processing
- PILOT_PLAYBOOK documentation covers bug patterns and detection probes—this is a reference guide for known issues and their diagnostic signatures
- Security headers were added and type error suppression in builds was removed—indicates stricter build/type checking is now enforced
- fix: pending state on destructive remove-invite action - addresses ui state management for destructive operations
- Legacy NULL-owned entities were causing duplication issues; fix applied to match and handle these cases correctly
- Migration 0012 consolidates orphan person entities and adds a unique index—part of data hygiene work for the database layer
- quorum check had a bug where it was validating its own template — fix applied in recent commit
- Assurance overhaul commit 'stop the engine marking its own homework' suggests a bug where the system was self-validating — likely an integrity fix in the minutes generation or status engine, decoupling evaluation from production.
- Visual system applied in Sprint 4: unknown/unverified status can no longer appear verified — unknown vs verified distinction is now visually enforced at the UI level.
- Owner picker's Save button renders below its own fold, causing UX issue where button is not immediately visible without scrolling
- company document uploads were broken for the company's own owner because RLS policy was too restrictive — fix addresses this specific edge case
- 0-row guards protect against edge cases where operations on empty result sets could produce undefined behavior or misleading outputs
- Fail-closed locks ensure that if lock acquisition fails, the operation does not proceed (prevents data corruption from unguarded concurrent access)
- chore: remove ZZ-PILOT test data (migrations 0021, 0022) — test data cleanup migrations were committed, indicating housekeeping rather than feature work.
- The type system was designed/written in a prior design pass but was never integrated into the codebase — the recent commit finally applied it.

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
- Later-phase features are now in active development: workspaces, DOCX upload, Tiptap editor, intelligence layer, and review shares
- HANDOFF.md was added for device takeover protocol, indicating active knowledge transfer and documentation maturity
- agents.md (launchpad memory) sync in recent commits confirms documentation maintenance workflow is operational and consistent
- agents.md (Launchpad memory) synced in recent commit indicates active documentation maintenance workflow
- Recent commit only synced CLAUDE.md (Launchpad memory), no code changes or feature work detected
- Recent activity is documentation maintenance only (CLAUDE.md sync); no feature development or code changes in latest commit
- Recent commit activity (agents.md sync) is documentation maintenance only, with no code changes or feature development
- Latest commit is documentation maintenance only (claude.md sync); no feature development or code changes detected
- Latest commit is documentation-only (CLAUDE.md sync); no code changes or feature work
- Latest commit is documentation sync only (CLAUDE.md); no active feature development in this commit cycle
- Latest commit (chore: sync CLAUDE.md) is documentation maintenance only; no code changes or feature development in this commit cycle.
- Recent commit is documentation-only (agents.md sync); no code changes, features, or progress on roadmap items in this commit cycle
- Recent commit activity is documentation-only (house-style minutes format synced); no code changes or feature development underway
- Recent commit activity is purely documentation maintenance (CLAUDE.md sync); no feature development or code changes detected in current commit cycle
- Recent commit activity consists of documentation maintenance only (claude.md sync); no feature development or code changes detected in current commit cycle
- Latest commit is documentation-only (chore: sync CLAUDE.md); no code changes or feature development.
- Vercel build skipping is configured for claude/agents.md-only commits to prevent launchpad sync loop cycles.
- Project has no objective currently set; feature development is continuing across later-phase scope (workspaces, docx upload, tiptap editor, intelligence layer, review shares) but prioritization clarity is lacking
- Recent commit activity is documentation maintenance only (claude.md sync); no feature development or code changes detected
- No objective currently set for the project; clarity needed on success criteria and prioritization
- Latest commit (chore: sync AGENTS.md) is documentation maintenance only with no code changes or feature development
- Latest commit is agents.md sync only; no code changes or feature development in this cycle.
- Vercel build skipping is in place for claude/agents.md-only commits to prevent launchpad sync loop cycles
- Recent commit is chore: sync AGENTS.md (documentation maintenance only); no code changes or feature development
- Recent commit is documentation maintenance only (agents.md sync); no active feature development or code changes in current cycle
- Vercel builds are skipped for claude.md and agents.md-only commits to prevent documentation sync loop cycles
- Build optimization: Vercel skips builds for claude/agents.md-only commits to prevent launchpad sync loop cycles
- Recent commit is documentation sync only (agents.md); no code changes or feature development in current cycle
- No objective is currently set for the project, creating ambiguity on success criteria and prioritization.
- Latest commit is chore: sync AGENTS.md - documentation maintenance only, no code or feature development
- Recent commits are documentation syncs only (AGENTS.md launchpad memory); no code changes or feature development underway
- No objective currently set for project; requires clarity on success criteria and prioritization
- Recent commit (chore: sync AGENTS.md) is documentation maintenance only; no feature development or code changes in this cycle
- Recent commit cycle continues documentation-only pattern with claude.md sync; no active code changes or feature development
- Latest commit is chore: sync claude.md - purely documentation maintenance with no code changes
- All audit findings resolved across both Opus and Codex implementations; project cleared for deployment
- Production deploy triggered for V2 with assurance engine, company memory, and confirmation flow ready
- Project is in maintenance mode with only documentation syncs (CLAUDE.md, agents.md) and no active feature development
- Latest commit is chore: sync AGENTS.md—documentation maintenance only with no code changes or feature development in current cycle
- Mobile polish and graph surface scale fixes completed in V3-2 and V3-3
- Latest commit: OpenRouter support + QA optimizations (final screen/button pass) - indicates active feature development resuming after documentation maintenance cycles
- OpenRouter environment setup documented in handoff.md, part of ongoing knowledge transfer documentation
- In-app AI model switcher implemented, eliminating need for Vercel environment variable edits to change models
- Per-model pricing display added to the model picker dropdown UI component
- Latest commit adds left sidebar navigation with mobile drawer UI component
- Latest active code change was fixing company creation; prior commits were documentation syncs with build skipping for launchpad-only changes
- Mobile optimisation pass completed across all pages in current commit
- Performance optimization applied: company stats aggregation moved from wire-level to Postgres queries for improved efficiency
- Sprints 2 + 3 introduced owners as real people in the data model and added the company document cabinet feature.
