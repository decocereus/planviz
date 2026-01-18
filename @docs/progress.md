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
- [ ] Phase 3 — Canvas MVP
  - [x] t12: Render phases/tasks as tldraw shapes with dependency arrows
- [ ] Phase 4 — File Watch & Sync
- [ ] Phase 5 — Chat Panel (Mock → Real)
- [ ] Phase 6 — Agent Integration (Claude-first, then Codex/OpenCode)
- [ ] Phase 7 — Agent Selector & Launch Modes
- [ ] Phase 8 — Terminal Session Bridging
- [ ] Phase 9 — Polish & UX

Notes will be appended here as phases complete.
