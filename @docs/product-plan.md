# Plan Visualizer — Product Plan

## Objective
- Provide a visual, bi-directional plan workspace (canvas + chat) that stays in the repo as `plan.md` plus `plan.layout.json`.
- Let users and agents collaborate on the same plan, with terminal context carried into the visualizer to avoid duplicate sessions.

## Primary Users
- Developers using terminal-centric agents (Codex CLI, Claude Code, OpenCode).
- Teams who keep plans in-repo and want a canvas view without leaving the project.

## Core User Flows
- **Launch visualizer first (MVP path):** User starts the app (desktop/web). From the UI, they can spawn a terminal agent (Claude Code/Codex/OpenCode) that runs in a new PTY exposed in the chat panel.
- **Launch from terminal session (future enhancement):** User tells their agent to "open plan visualizer." The existing terminal/PTY session is bridged into the visualizer; agent context and cwd are preserved so they continue in the same session via the UI.
- **Plan editing:** User drags/reorders tasks/phases on canvas; changes sync to `plan.md` + `plan.layout.json`. Agent edits to `plan.md` reflect on canvas in real time.
- **Status tracking:** Agent (or user) marks tasks done/in-progress via chat or canvas; status badges update immediately.

## Requirements
- **Storage:** Markdown content in `plan.md`; layout in `plan.layout.json`; retain layouts/history for the last 5 plans a user opened with Planviz. If a plan falls outside the recent-5 cache, allow the user to point at `plan.md` and regenerate layout defaults on load.
- **Canvas:** TLDraw shapes for phases/tasks; dependency arrows; inline edits; keyboard shortcuts for quick add/mark done.
- **Chat/Agent:** ACP-compatible bridge; streaming responses; plan update events; reconnect/status indicators.
- **File sync:** Watch `plan.md`/layout for external edits; auto-reload by default; setting to disable then prompt user; avoid destructive overwrites.
- **Agent selection:** Configurable on launch (CLI flags/env) and switchable in UI; default to last-used per plan; priority lineup: Claude Code, Codex, OpenCode.
- **Agent auth reuse:** Prefer existing CLI creds—Claude Code from `~/.claude/.credentials.json` or macOS Keychain item "Claude Code-credentials"; Codex from `~/.codex/auth.json` (or `CODEX_HOME`) or macOS Keychain "Codex Auth" (account `cli|<hash>`). Expose env overrides if needed.
- **Terminal continuity:** Spawn new PTY from UI for MVP; bridging an existing terminal session is a planned enhancement.

## Constraints & Considerations
- Plan format must be human- and agent-friendly (checkbox list items with stable IDs).
- Avoid lock-in: plain files in repo; no server dependency for core features.
- Cross-platform (macOS/Linux/Windows) via Tauri; minimal setup to open an existing repo.

## Success Criteria (MVP)
- Open a repo, load `plan.md` into canvas, move/add tasks, auto-save both content and layout.
- Chat with an agent in the same window; receive streaming replies; see task status updates reflected on canvas.
- Launch flow works from a terminal session without losing context; alternative launch from UI can start a new terminal agent session.
