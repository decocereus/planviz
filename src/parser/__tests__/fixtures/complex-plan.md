# Plan: Complex Test Plan

## Phase 0 — Bootstrap
- [x] Initialize repo (id: t1)
- [x] Install dependencies (depends: t1) (id: t2)
- [x] Configure tooling (depends: t2) (id: t3)

## Phase 1 — Core Features
- [ ] Build parser (depends: t3) (id: t4)
- [ ] Build serializer (depends: t4) (id: t5)
- [ ] Add validation (depends: t4, t5) (id: t6)

## Phase 2 — Testing
- [ ] Unit tests (depends: t6) (id: t7)
- [ ] Integration tests (depends: t7) (id: t8)
