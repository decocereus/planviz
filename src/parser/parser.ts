/**
 * Plan Markdown Parser
 *
 * Parses plan.md files into structured PlanDoc objects using remark.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import type { Root, ListItem, Paragraph, Text } from 'mdast';
import type { PlanDoc, PlanPhase, PlanTask, PlanNode, PlanEdge, Status } from '../types';
import { PATTERNS, extractTaskId, extractDependencies, cleanTaskContent } from './schema';

export interface ParseResult {
  success: true;
  doc: PlanDoc;
  title: string;
}

export interface ParseError {
  success: false;
  errors: string[];
}

export type ParseOutput = ParseResult | ParseError;

/** Extract text content from mdast node */
function getTextContent(node: Paragraph | Text | ListItem): string {
  if (node.type === 'text') {
    return node.value;
  }
  if ('children' in node) {
    return node.children
      .map((child) => {
        if (child.type === 'text') return child.value;
        if (child.type === 'inlineCode') return `\`${child.value}\``;
        if ('children' in child) return getTextContent(child as Paragraph);
        return '';
      })
      .join('');
  }
  return '';
}

/** Parse a list item into a PlanTask */
function parseListItem(item: ListItem): PlanTask | null {
  if (!item.children.length) return null;

  const firstChild = item.children[0];
  if (firstChild.type !== 'paragraph') return null;

  const text = getTextContent(firstChild);
  const id = extractTaskId(text);

  if (!id) return null; // Tasks must have IDs

  const checked = item.checked;
  let status: Status = 'pending';

  if (checked === true) {
    status = 'completed';
  } else if (checked === false) {
    // Check for in-progress marker in text
    if (text.includes('[-]') || text.match(/^\s*-\s*\[-\]/)) {
      status = 'in_progress';
    }
  }

  const dependencies = extractDependencies(text);
  const content = cleanTaskContent(text);

  return {
    id,
    content,
    status,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
  };
}

/** Parse markdown string into PlanDoc */
export function parsePlan(markdown: string): ParseOutput {
  const errors: string[] = [];
  const phases: PlanPhase[] = [];
  const nodes: PlanNode[] = [];
  const edges: PlanEdge[] = [];
  const seenIds = new Set<string>();
  let title = 'Untitled Plan';
  let currentPhase: PlanPhase | null = null;

  // Parse markdown to AST with GFM support for checkboxes
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown) as Root;

  visit(tree, (node) => {
    // Handle H1 - Plan title
    if (node.type === 'heading' && node.depth === 1) {
      const text = getTextContent(node.children[0] as Paragraph);
      const match = text.match(/^Plan:\s*(.+)$/);
      if (match) {
        title = match[1].trim();
      } else {
        title = text;
      }
    }

    // Handle H2 - Phase heading
    if (node.type === 'heading' && node.depth === 2) {
      const text = getTextContent(node.children[0] as Paragraph);
      const match = text.match(PATTERNS.PHASE_HEADING);

      if (match) {
        const phaseNum = match[1];
        const phaseName = match[2].trim();
        const phaseId = `phase_${phaseNum}`;

        if (seenIds.has(phaseId)) {
          errors.push(`Duplicate phase ID: ${phaseId}`);
        }
        seenIds.add(phaseId);

        currentPhase = {
          id: phaseId,
          title: `Phase ${phaseNum} — ${phaseName}`,
          tasks: [],
        };
        phases.push(currentPhase);

        // Add phase node
        nodes.push({
          id: phaseId,
          type: 'phase',
          label: phaseName,
          status: 'pending', // Will be computed from tasks
        });
      }
    }

    // Handle lists - contains tasks
    if (node.type === 'list' && currentPhase) {
      for (const item of node.children) {
        if (item.type === 'listItem') {
          const task = parseListItem(item);
          if (task) {
            if (seenIds.has(task.id)) {
              errors.push(`Duplicate task ID: ${task.id}`);
            }
            seenIds.add(task.id);

            currentPhase.tasks.push(task);

            // Add task node
            nodes.push({
              id: task.id,
              type: 'task',
              label: task.content,
              status: task.status,
              phaseId: currentPhase.id,
            });

            // Add dependency edges
            if (task.dependencies) {
              for (const dep of task.dependencies) {
                edges.push({
                  id: `edge_${dep}_${task.id}`,
                  from: dep,
                  to: task.id,
                });
              }
            }
          }
        }
      }
    }
  });

  // Validate dependency references
  for (const edge of edges) {
    if (!seenIds.has(edge.from)) {
      errors.push(`Task "${edge.to}" references unknown dependency "${edge.from}"`);
    }
  }

  // Compute phase statuses based on tasks
  for (const phase of phases) {
    const phaseNode = nodes.find((n) => n.id === phase.id);
    if (phaseNode && phase.tasks.length > 0) {
      const allCompleted = phase.tasks.every((t) => t.status === 'completed');
      const anyInProgress = phase.tasks.some(
        (t) => t.status === 'in_progress' || t.status === 'completed'
      );

      if (allCompleted) {
        phaseNode.status = 'completed';
      } else if (anyInProgress) {
        phaseNode.status = 'in_progress';
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    title,
    doc: { phases, nodes, edges },
  };
}

/** Validate that all IDs in a plan are unique and properly formatted */
export function validatePlan(doc: PlanDoc): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  // Check phase IDs
  for (const phase of doc.phases) {
    if (seenIds.has(phase.id)) {
      errors.push(`Duplicate phase ID: ${phase.id}`);
    }
    seenIds.add(phase.id);

    // Check task IDs
    for (const task of phase.tasks) {
      if (seenIds.has(task.id)) {
        errors.push(`Duplicate task ID: ${task.id}`);
      }
      seenIds.add(task.id);

      // Validate ID format
      if (!/^[a-zA-Z0-9_-]+$/.test(task.id)) {
        errors.push(`Invalid task ID format: ${task.id}`);
      }
    }
  }

  // Validate dependency references
  for (const phase of doc.phases) {
    for (const task of phase.tasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          if (!seenIds.has(dep)) {
            errors.push(`Task "${task.id}" references unknown dependency "${dep}"`);
          }
        }
      }
    }
  }

  return errors;
}
