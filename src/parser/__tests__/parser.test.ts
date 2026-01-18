import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePlan, validatePlan } from '../parser';
import { serializePlan, computePlanHash } from '../serializer';
import {
  PATTERNS,
  parseCheckboxStatus,
  statusToCheckbox,
  extractTaskId,
  extractDependencies,
  cleanTaskContent,
} from '../schema';

const fixturesDir = join(__dirname, 'fixtures');

describe('Schema utilities', () => {
  describe('PATTERNS', () => {
    it('matches plan title', () => {
      expect('# Plan: My Plan'.match(PATTERNS.PLAN_TITLE)?.[1]).toBe('My Plan');
    });

    it('matches phase heading', () => {
      // Pattern matches the text content without ## (as extracted from AST)
      const match = 'Phase 0 — Bootstrap'.match(PATTERNS.PHASE_HEADING);
      expect(match?.[1]).toBe('0');
      expect(match?.[2]).toBe('Bootstrap');
    });

    it('matches task ID', () => {
      expect('Some task (id: t1)'.match(PATTERNS.TASK_ID)?.[1]).toBe('t1');
      expect('Task (id: task_123)'.match(PATTERNS.TASK_ID)?.[1]).toBe('task_123');
    });

    it('matches dependencies', () => {
      const match = 'Task (depends: t1, t2) (id: t3)'.match(PATTERNS.DEPENDENCIES);
      expect(match?.[1]).toBe('t1, t2');
    });
  });

  describe('parseCheckboxStatus', () => {
    it('parses checkbox states', () => {
      expect(parseCheckboxStatus(' ')).toBe('pending');
      expect(parseCheckboxStatus('x')).toBe('completed');
      expect(parseCheckboxStatus('X')).toBe('completed');
      expect(parseCheckboxStatus('-')).toBe('in_progress');
    });
  });

  describe('statusToCheckbox', () => {
    it('converts status to checkbox', () => {
      expect(statusToCheckbox('pending')).toBe(' ');
      expect(statusToCheckbox('completed')).toBe('x');
      expect(statusToCheckbox('in_progress')).toBe('-');
    });
  });

  describe('extractTaskId', () => {
    it('extracts task ID from text', () => {
      expect(extractTaskId('Some task (id: t1)')).toBe('t1');
      expect(extractTaskId('No ID here')).toBeNull();
    });
  });

  describe('extractDependencies', () => {
    it('extracts dependencies from text', () => {
      expect(extractDependencies('Task (depends: t1, t2) (id: t3)')).toEqual(['t1', 't2']);
      expect(extractDependencies('Task (id: t1)')).toEqual([]);
    });
  });

  describe('cleanTaskContent', () => {
    it('removes ID and dependencies from text', () => {
      expect(cleanTaskContent('Build feature (depends: t1) (id: t2)')).toBe('Build feature');
      expect(cleanTaskContent('Simple task (id: t1)')).toBe('Simple task');
    });
  });
});

describe('Parser', () => {
  describe('parsePlan', () => {
    it('parses simple plan', () => {
      const markdown = readFileSync(join(fixturesDir, 'simple-plan.md'), 'utf-8');
      const result = parsePlan(markdown);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.title).toBe('Simple Test Plan');
      expect(result.doc.phases).toHaveLength(2);
      expect(result.doc.phases[0].id).toBe('phase_0');
      expect(result.doc.phases[0].tasks).toHaveLength(2);
      expect(result.doc.phases[0].tasks[0].id).toBe('t1');
      expect(result.doc.phases[0].tasks[0].status).toBe('pending');
      expect(result.doc.phases[0].tasks[1].status).toBe('completed');
    });

    it('parses complex plan with dependencies', () => {
      const markdown = readFileSync(join(fixturesDir, 'complex-plan.md'), 'utf-8');
      const result = parsePlan(markdown);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.doc.phases).toHaveLength(3);
      expect(result.doc.edges.length).toBeGreaterThan(0);

      // Check dependency parsing
      const task6 = result.doc.phases[1].tasks.find((t) => t.id === 't6');
      expect(task6?.dependencies).toEqual(['t4', 't5']);
    });

    it('creates nodes for phases and tasks', () => {
      const markdown = readFileSync(join(fixturesDir, 'simple-plan.md'), 'utf-8');
      const result = parsePlan(markdown);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const phaseNodes = result.doc.nodes.filter((n) => n.type === 'phase');
      const taskNodes = result.doc.nodes.filter((n) => n.type === 'task');

      expect(phaseNodes).toHaveLength(2);
      expect(taskNodes).toHaveLength(4);
    });

    it('detects duplicate IDs', () => {
      const markdown = `# Plan: Test

## Phase 0 — Setup
- [ ] Task one (id: t1)
- [ ] Task two (id: t1)
`;
      const result = parsePlan(markdown);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors).toContain('Duplicate task ID: t1');
    });

    it('detects invalid dependency references', () => {
      const markdown = `# Plan: Test

## Phase 0 — Setup
- [ ] Task one (depends: nonexistent) (id: t1)
`;
      const result = parsePlan(markdown);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.errors[0]).toContain('unknown dependency');
    });
  });

  describe('validatePlan', () => {
    it('validates a correct plan', () => {
      const markdown = readFileSync(join(fixturesDir, 'simple-plan.md'), 'utf-8');
      const result = parsePlan(markdown);
      if (!result.success) return;

      const errors = validatePlan(result.doc);
      expect(errors).toHaveLength(0);
    });
  });
});

describe('Serializer', () => {
  describe('serializePlan', () => {
    it('serializes a plan to markdown', () => {
      const markdown = readFileSync(join(fixturesDir, 'simple-plan.md'), 'utf-8');
      const result = parsePlan(markdown);
      if (!result.success) return;

      const serialized = serializePlan(result.doc, { title: result.title });

      expect(serialized).toContain('# Plan: Simple Test Plan');
      expect(serialized).toContain('## Phase 0 — Setup');
      expect(serialized).toContain('(id: t1)');
    });
  });

  describe('round-trip stability', () => {
    it('maintains content through parse-serialize cycle', () => {
      const markdown = readFileSync(join(fixturesDir, 'simple-plan.md'), 'utf-8');
      const result1 = parsePlan(markdown);
      if (!result1.success) return;

      const serialized = serializePlan(result1.doc, { title: result1.title });
      const result2 = parsePlan(serialized);
      if (!result2.success) return;

      // Same number of phases and tasks
      expect(result2.doc.phases.length).toBe(result1.doc.phases.length);
      expect(result2.doc.nodes.length).toBe(result1.doc.nodes.length);

      // Same task IDs and statuses
      for (let i = 0; i < result1.doc.phases.length; i++) {
        const phase1 = result1.doc.phases[i];
        const phase2 = result2.doc.phases[i];
        expect(phase2.tasks.length).toBe(phase1.tasks.length);

        for (let j = 0; j < phase1.tasks.length; j++) {
          expect(phase2.tasks[j].id).toBe(phase1.tasks[j].id);
          expect(phase2.tasks[j].status).toBe(phase1.tasks[j].status);
        }
      }
    });

    it('maintains dependencies through parse-serialize cycle', () => {
      const markdown = readFileSync(join(fixturesDir, 'complex-plan.md'), 'utf-8');
      const result1 = parsePlan(markdown);
      if (!result1.success) return;

      const serialized = serializePlan(result1.doc, { title: result1.title });
      const result2 = parsePlan(serialized);
      if (!result2.success) return;

      // Same edges
      expect(result2.doc.edges.length).toBe(result1.doc.edges.length);
    });
  });

  describe('computePlanHash', () => {
    it('produces consistent hashes', () => {
      const markdown = '# Plan: Test\n';
      const hash1 = computePlanHash(markdown);
      const hash2 = computePlanHash(markdown);

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different content', () => {
      const hash1 = computePlanHash('# Plan: Test 1\n');
      const hash2 = computePlanHash('# Plan: Test 2\n');

      expect(hash1).not.toBe(hash2);
    });
  });
});
