/**
 * Plan Markdown Serializer
 *
 * Converts PlanDoc objects back to markdown format.
 * Designed for round-trip stability - parse then serialize should produce identical output.
 */

import type { PlanDoc, PlanPhase, PlanTask, Status } from '../types';
import { statusToCheckbox } from './schema';

export interface SerializeOptions {
  /** Plan title (default: "Untitled Plan") */
  title?: string;
  /** Include trailing newline (default: true) */
  trailingNewline?: boolean;
}

/** Serialize a single task to markdown */
function serializeTask(task: PlanTask): string {
  const checkbox = statusToCheckbox(task.status);
  let line = `- [${checkbox}] ${task.content}`;

  // Add dependencies if present
  if (task.dependencies && task.dependencies.length > 0) {
    line += ` (depends: ${task.dependencies.join(', ')})`;
  }

  // Add ID
  line += ` (id: ${task.id})`;

  return line;
}

/** Serialize a phase to markdown */
function serializePhase(phase: PlanPhase): string {
  const lines: string[] = [];

  // Phase heading
  lines.push(phase.title.startsWith('##') ? phase.title : `## ${phase.title}`);

  // Tasks
  for (const task of phase.tasks) {
    lines.push(serializeTask(task));
  }

  return lines.join('\n');
}

/** Serialize PlanDoc to markdown string */
export function serializePlan(doc: PlanDoc, options: SerializeOptions = {}): string {
  const { title = 'Untitled Plan', trailingNewline = true } = options;

  const lines: string[] = [];

  // Title
  lines.push(`# Plan: ${title}`);
  lines.push('');

  // Phases
  for (let i = 0; i < doc.phases.length; i++) {
    lines.push(serializePhase(doc.phases[i]));

    // Add blank line between phases
    if (i < doc.phases.length - 1) {
      lines.push('');
    }
  }

  let result = lines.join('\n');

  if (trailingNewline) {
    result += '\n';
  }

  return result;
}

/** Update a single task's status in a PlanDoc (immutable) */
export function updateTaskStatus(doc: PlanDoc, taskId: string, status: Status): PlanDoc {
  return {
    ...doc,
    phases: doc.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      ),
    })),
    nodes: doc.nodes.map((node) =>
      node.id === taskId ? { ...node, status } : node
    ),
  };
}

/** Update a task's content in a PlanDoc (immutable) */
export function updateTaskContent(doc: PlanDoc, taskId: string, content: string): PlanDoc {
  return {
    ...doc,
    phases: doc.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) =>
        task.id === taskId ? { ...task, content } : task
      ),
    })),
    nodes: doc.nodes.map((node) =>
      node.id === taskId ? { ...node, label: content } : node
    ),
  };
}

/** Add a new task to a phase (immutable) */
export function addTask(
  doc: PlanDoc,
  phaseId: string,
  task: Omit<PlanTask, 'status'> & { status?: Status }
): PlanDoc {
  const newTask: PlanTask = {
    ...task,
    status: task.status ?? 'pending',
  };

  return {
    ...doc,
    phases: doc.phases.map((phase) =>
      phase.id === phaseId
        ? { ...phase, tasks: [...phase.tasks, newTask] }
        : phase
    ),
    nodes: [
      ...doc.nodes,
      {
        id: newTask.id,
        type: 'task' as const,
        label: newTask.content,
        status: newTask.status,
        phaseId,
      },
    ],
    edges: newTask.dependencies
      ? [
          ...doc.edges,
          ...newTask.dependencies.map((dep) => ({
            id: `edge_${dep}_${newTask.id}`,
            from: dep,
            to: newTask.id,
          })),
        ]
      : doc.edges,
  };
}

/** Remove a task from a PlanDoc (immutable) */
export function removeTask(doc: PlanDoc, taskId: string): PlanDoc {
  return {
    ...doc,
    phases: doc.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.filter((task) => task.id !== taskId),
    })),
    nodes: doc.nodes.filter((node) => node.id !== taskId),
    edges: doc.edges.filter((edge) => edge.from !== taskId && edge.to !== taskId),
  };
}

/** Compute a hash of the plan content for change detection */
export function computePlanHash(markdown: string): string {
  // Simple hash function for change detection
  let hash = 0;
  for (let i = 0; i < markdown.length; i++) {
    const char = markdown.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
