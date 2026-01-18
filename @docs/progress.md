# Progress Log

- [x] Phase 0 — Bootstrap (completed 2026-01-18)
  - [x] t1: Initialize Tauri + Vite React 19 TS template
  - [x] t2: Add ESLint/Prettier and cargo fmt/clippy configs
  - [x] t3: Install core frontend deps (tldraw, zustand, tanstack query, tailwind, remark)
  - [x] t4: Define shared types (PlanNode, PlanEdge, PlanDoc, LayoutMap, Status)
- [x] Phase 1 — Plan Model & Parser (completed 2026-01-18)
  - [x] t5: Define markdown schema (phases as headings, tasks as checkboxes with ids)
  - [x] t6: Implement parser (remark) with stable ID validation and dependency parsing
  - [x] t7: Implement serializer with round-trip stability tests
  - [x] t8: Add fixture plans and unit tests (vitest)
- [x] Phase 2 — Layout Persistence (completed 2026-01-18)
  - [x] t9: Implement Rust commands for plan.layout.json read/write with defaults
  - [x] t10: Add .plan-history/ snapshot rotation with 5-plan limit and time-based cadence
  - [x] t11: Auto-place unpositioned nodes when merging layout with grid-based positioning
- [x] Phase 3 — Canvas MVP (completed 2026-01-18)
  - [x] t12: Render phases/tasks as tldraw shapes with dependency arrows
  - [x] t13: Enable drag/resize/inline edit; debounce auto-save to layout
  - [x] t14: Quick actions: add task/phase, mark done/in-progress
  - [x] t15: Write-through to markdown and layout with minimal diffs
- [x] Phase 4 — File Watch & Sync (completed 2026-01-18)
  - [x] t16: Add file watcher on plan.md and plan.layout.json emitting Tauri events
  - [x] t17: Handle external changes with auto-reload by default; configurable setting to prompt instead; show conflict banner
- [ ] Phase 5 — Chat Panel (Mock → Real)
- [ ] Phase 6 — Agent Integration (Claude-first, then Codex/OpenCode)
- [ ] Phase 7 — Agent Selector & Launch Modes
- [ ] Phase 8 — Terminal Session Bridging
- [ ] Phase 9 — Polish & UX

Notes will be appended here as phases complete.
