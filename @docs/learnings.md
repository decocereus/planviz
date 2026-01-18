# Learnings & Decisions

Log decisions, nuances, and implementation notes as they occur. Keep entries time-stamped and concise for future reference.

## 2026-01-18 - Phase 0 Bootstrap

- **Icons**: Tauri 2.0 requires RGBA format for icons. Used ImageMagick to generate a placeholder icon.png (512x512).
- **Types**: Defined `Status`, `PlanTask`, `PlanPhase`, `PlanNode`, `PlanEdge`, `PlanDoc`, `NodeLayout`, `LayoutMap`, and `LayoutFile` in `src/types/index.ts`. The `LayoutFile` includes a `planHash` field for change detection.
- **Remark packages**: Installed `remark`, `remark-parse`, `remark-stringify`, `unist-util-visit`, and `@types/mdast` for markdown parsing in Phase 1.

## 2026-01-18 - Phase 1 Plan Model & Parser

- **GFM checkboxes**: Required `remark-gfm` plugin to parse `- [x]` checkboxes. Without it, `item.checked` is always undefined.
- **Heading AST**: Heading text in mdast doesn't include the `#` prefix - that's represented by `depth` property. Pattern matching should account for this.
- **Schema format**: Plan files use `## Phase N — Name` for phases and `- [ ] Task (id: tx)` for tasks. Dependencies are optional: `(depends: t1, t2)`.
- **Parser structure**: `src/parser/` contains `schema.ts` (regex patterns & utilities), `parser.ts` (remark AST parsing), `serializer.ts` (PlanDoc → markdown).
- **Round-trip stability**: Parser → Serializer → Parser produces equivalent structures. IDs, statuses, and dependencies are preserved.
