# Plan: Build Plan Visualizer

## Phase 0 — Bootstrap
- [ ] Initialize Tauri + Vite React 19 TS template in repo (id: t1)
- [ ] Add ESLint/Prettier and cargo fmt/clippy configs (id: t2)
- [ ] Install core frontend deps (tldraw, zustand, tanstack query, tailwind, remark, shacn components) (id: t3)
- [ ] Define shared types (PlanNode, PlanEdge, PlanDoc, LayoutMap, Status) (id: t4)

## Phase 1 — Plan Model & Parser
- [ ] Define markdown schema (phases as headings, tasks as list items with checkboxes and `(id: tx)`) (id: t5)
- [ ] Implement parser (remark) with stable ID validation and dependency parsing (id: t6)
- [ ] Implement serializer with round-trip stability tests (id: t7)
- [ ] Add fixture plans and unit tests (id: t8)

## Phase 2 — Layout Persistence
- [ ] Implement Rust commands for `plan.layout.json` read/write with defaults (id: t9)
- [ ] Add `.plan-history/` snapshot rotation (per-plan history; only retain layouts/history for last 5 plans; optional time-based cadence) (id: t10)
- [ ] Auto-place unpositioned nodes when merging layout; regenerate defaults when opening plans outside recent-5 cache (id: t11)

## Phase 3 — Canvas MVP
- [ ] Render phases/tasks as tldraw shapes with dependency arrows (id: t12)
- [ ] Enable drag/resize/inline edit; debounce auto-save to layout (id: t13)
- [ ] Quick actions: add task/phase, mark done/in-progress (id: t14)
- [ ] Write-through to markdown and layout with minimal diffs (id: t15)

## Phase 4 — File Watch & Sync
- [ ] Add file watcher on `plan.md` and `plan.layout.json` emitting Tauri events (id: t16)
- [ ] Handle external changes with auto-reload by default; configurable setting to prompt instead; show conflict banner (id: t17)
- [ ] Preserve user edits and avoid clobber; snapshot before apply (id: t18)

## Phase 5 — Chat Panel (Mock → Real)
- [ ] Build chat UI with streaming view and history (id: t19)
- [ ] Implement mock ACP client to validate message/plan-update loop (id: t20)
- [ ] Apply agent-driven plan edits to markdown/layout and refresh canvas (id: t21)

## Phase 6 — Agent Integration (Claude-first, then Codex/OpenCode)
- [ ] Implement Claude Code adapter (PTY → ACP-like) with send/stream commands (id: t22)
- [ ] Reuse CLI creds: Claude from `~/.claude/.credentials.json` or Keychain "Claude Code-credentials"; Codex from `~/.codex/auth.json`/`CODEX_HOME` or Keychain "Codex Auth"; support env overrides (id: t34)
- [ ] Surface connection status, retries, and errors in UI (id: t23)
- [ ] Follow-up: integrate Codex via PTY bridge and OpenCode via ACP; validate plan updates syncing end-to-end (id: t24)

## Phase 7 — Agent Selector & Launch Modes
- [ ] CLI flags: `--plan`, `--agent (claude-code|codex|opencode)`, `--cwd` (id: t25)
- [ ] Desktop/web launch flow to open repo/plan and pick agent (id: t26)
- [ ] UI dropdown showing current agent (order: Claude Code, Codex, OpenCode) and allowing switch with persisted preference (id: t27)

## Phase 8 — Terminal Session Bridging
- [ ] MVP: from UI launch, spawn new PTY in cwd and forward to chat (id: t28)
- [ ] Future: from terminal launch, attach to existing PTY/session and expose in chat UI (id: t29)
- [ ] Map PTY output/resize/signals cleanly; maintain env/cwd parity; safe detach/reattach (id: t30)

## Phase 9 — Polish & UX
- [ ] Status badges/colors and animations for updates on canvas (id: t31)
- [ ] Keyboard shortcuts, toasts, loading skeletons (id: t32)
- [ ] Accessibility pass (focus, ARIA for chat/input/lists) (id: t33)

## Phase 10 — CodexMonitor Auth Parity
- [ ] Prefer CLI-owned auth (no direct token reads); rely on CLI config/state in `CODEX_HOME` (id: t35)
- [ ] Support optional per-plan `CODEX_HOME` override for Codex sessions (id: t36)
- [ ] Add legacy Codex home discovery hook if we introduce plan-level storage (id: t37)
