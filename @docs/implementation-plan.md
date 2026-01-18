# Plan Visualizer — Implementation Plan

## Tech Stack
- **Shell:** Tauri (Rust backend + React 19/TypeScript frontend via Vite).
- **Canvas:** tldraw for shapes/interactions; custom adapters to map plan nodes/edges.
- **State/UI:** Zustand for local state, TanStack Query for async, Tailwind for styling, shacn UI components for primitives/forms.
- **Markdown:** remark/unist for parsing/serialization; stable IDs in list items `(id: t1)`.
- **Backend:** Rust commands for file I/O, layout persistence, local history rotation; notify for file watching; serde/serde_json for layout/data; ACP client in Rust for OpenCode; PTY bridge adapter for Claude/Codex.

## File Contracts
- `plan.md`: Markdown source of phases/tasks with checkboxes and stable IDs.
- `plan.layout.json`: Layout positions `{ nodes: {id: {x,y,width,height}}, edges: [...] }`.
- `.plan-history/`: Rotated checkpoints for both content and layout (per plan). Persist recent plans up to 5 entries; if a plan is older, regenerate layout defaults on next open and start fresh history.

## Auth Inputs (Claude/Codex)
- **Claude Code:** read CLI creds from `~/.claude/.credentials.json`; on macOS also read Keychain service "Claude Code-credentials" (account "Claude Code"). Tokens may be OAuth (access/refresh/expiry) or token-only.
- **Codex:** read from `~/.codex/auth.json` (or `CODEX_HOME` override); on macOS also read Keychain service "Codex Auth" with account `cli|<sha256(CODEX_HOME)[:16]>` containing `tokens.access_token`/`refresh_token`.
- **Env overrides:** allow optional env token overrides (e.g., `CLAUDE_AI_SESSION_KEY`/`CLAUDE_WEB_SESSION_KEY`/`CLAUDE_WEB_COOKIE`) when present.

## Phased Delivery
**Phase 0 — Bootstrap**
- Init Tauri + Vite React 19 TS template; add lint/format (ESLint/Prettier, cargo fmt/clippy).
- Add deps: tldraw, zustand, @tanstack/react-query, remark/unist toolchain, tailwind, shacn UI components.
- Define shared types: PlanNode, PlanEdge, PlanDoc, LayoutMap, Status enum.

**Phase 1 — Plan Model & Parser**
- Define markdown schema: phases as headings; tasks as list items with checkbox, optional metadata, and `(id: tX)` suffix; optional `depends: tY` list.
- Implement parser (remark) to produce PlanDoc with stable IDs; validate uniqueness; gracefully handle missing IDs.
- Implement serializer that round-trips without noisy diffs; unit tests for parse/serialize.
- Seed sample `plan.md` fixture for tests.

**Phase 2 — Layout Persistence**
- Implement Rust commands to read/write `plan.layout.json` with validation/defaults; create missing layout with auto-placement seeds.
- Add history rotation in `.plan-history/` with timestamped snapshots; prune policy (keep per-plan history, prune older snapshots as needed; only retain last 5 plans in cache).
- Frontend loader merges PlanDoc with layout; auto-place unplaced nodes; when opening a plan outside the recent-5 cache, regenerate layout defaults and seed history.

**Phase 3 — Canvas MVP**
- Render phases/tasks as tldraw shapes with dependency arrows.
- Interactions: select, drag, resize, inline edit task title/description.
- Auto-save layout on move with debounce; push snapshots.
- Quick actions: add task/phase, mark done/in-progress; writes through markdown serializer and layout.

**Phase 4 — File Watch & Sync**
- Rust file watcher on `plan.md` and layout; emit Tauri events.
- Frontend handles external changes: auto-reload by default; if disabled via settings, prompt user before reload; conflict banner when diverged.
- Ensure markdown writes are minimal diffs; avoid clobbering external edits.

**Phase 5 — Chat Panel (Mock → Real)**
- Build chat UI (sidebar/panel) with message history and streaming view.
- Mock ACP client in Rust returning canned stream events to validate UI loop.
- Wire plan update events: agent message that modifies plan triggers write to `plan.md` and canvas refresh.

**Phase 6 — Agent Integration (Claude-first, then Codex/OpenCode)**
- Implement Claude Code adapter (PTY → ACP-like bridge) with send/stream semantics.
- Reuse existing CLI creds: Claude from `~/.claude/.credentials.json` or Keychain "Claude Code-credentials"; Codex from `~/.codex/auth.json`/`CODEX_HOME` or Keychain "Codex Auth" (account `cli|<hash>`); support optional env overrides.
- Add connection status, retries, and error surfacing in UI.
- Follow-up: integrate Codex via similar PTY bridge; integrate OpenCode via native ACP client.

**Phase 7 — Agent Selector & Launch Modes**
- CLI entry (name TBD): `--plan path/to/plan.md --agent claude-code|codex|opencode --cwd .`.
- Desktop/web launch: prompt for repo/plan path; default to last opened.
- UI dropdown for agent selection reflecting launch choice; persist last-used per plan; lineup order: Claude Code, Codex, OpenCode.

**Phase 8 — Terminal Session Bridging**
- **MVP:** when launched from UI/desktop, spawn a new PTY in chosen cwd and expose it in chat; forward STDIN/STDOUT with resize/signals handled; ensure env/cwd parity.
- **Future enhancement:** when launched from an existing terminal, detect and attach to that PTY/session so context carries over into the visualizer.
- Map PTY output to chat stream; ensure clean detach/reattach paths.

**Phase 9 — Polish & UX**
- Status badges/colors on nodes; dependency arrows styling; animations on updates.
- Keyboard shortcuts; toasts/errors; loading skeletons.
- Accessibility: focus management, ARIA labels for chat/input/lists.

## Risks & Mitigations
- **PTY bridging complexity:** start with OpenCode ACP (no PTY), then add PTY adapter with a thin translation layer; keep clear separation between ACP transport and PTY transport.
- **Markdown drift:** enforce stable IDs; serializer preserves formatting; include tests for diff stability.
- **File conflicts:** watch + prompt; keep history snapshots for recovery.
- **Cross-platform quirks:** rely on Tauri APIs and Rust crates for PTY; test on macOS/Linux/Windows.

## Open Items
- Agent auth/config discovery (env vars vs UI inputs).
