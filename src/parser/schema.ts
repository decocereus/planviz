/**
 * Markdown Schema for Plan Documents
 *
 * Structure:
 * - H1: Plan title (# Plan: <title>)
 * - H2: Phase headings (## Phase N — <name>)
 * - List items: Tasks with checkboxes and IDs
 *
 * Task format:
 * - [ ] Task description (id: <unique_id>)
 * - [x] Completed task (id: <unique_id>)
 * - [-] In-progress task (id: <unique_id>)
 *
 * Dependencies (optional, in task description):
 * - [ ] Task that depends on t1 (depends: t1) (id: t2)
 * - [ ] Task with multiple deps (depends: t1, t3) (id: t4)
 */

/** Regex patterns for parsing */
export const PATTERNS = {
  /** Matches plan title: # Plan: <title> */
  PLAN_TITLE: /^#\s+Plan:\s*(.+)$/,

  /** Matches phase heading text: Phase N — <name> (without ## prefix) */
  PHASE_HEADING: /^Phase\s+(\d+)\s*[—–-]\s*(.+)$/,

  /** Matches task ID at end of line: (id: <id>) */
  TASK_ID: /\(id:\s*([a-zA-Z0-9_-]+)\)\s*$/,

  /** Matches checkbox state: [ ], [x], [-] */
  CHECKBOX: /^\s*-\s*\[([ xX-])\]\s*/,

  /** Matches dependencies: (depends: t1, t2, ...) */
  DEPENDENCIES: /\(depends:\s*([a-zA-Z0-9_,\s-]+)\)/,
} as const;

/** Parse checkbox state to Status */
export function parseCheckboxStatus(char: string): 'pending' | 'in_progress' | 'completed' {
  switch (char.toLowerCase()) {
    case 'x':
      return 'completed';
    case '-':
      return 'in_progress';
    default:
      return 'pending';
  }
}

/** Convert Status to checkbox character */
export function statusToCheckbox(status: 'pending' | 'in_progress' | 'completed'): string {
  switch (status) {
    case 'completed':
      return 'x';
    case 'in_progress':
      return '-';
    default:
      return ' ';
  }
}

/** Extract task ID from text */
export function extractTaskId(text: string): string | null {
  const match = text.match(PATTERNS.TASK_ID);
  return match ? match[1] : null;
}

/** Extract dependencies from text */
export function extractDependencies(text: string): string[] {
  const match = text.match(PATTERNS.DEPENDENCIES);
  if (!match) return [];
  return match[1].split(',').map((d) => d.trim()).filter(Boolean);
}

/** Remove ID and dependencies from task text to get clean content */
export function cleanTaskContent(text: string): string {
  return text
    .replace(PATTERNS.TASK_ID, '')
    .replace(PATTERNS.DEPENDENCIES, '')
    .trim();
}
