/**
 * TLDraw shape utilities for plan visualization
 *
 * Converts PlanDoc nodes to TLDraw shapes using built-in geo and arrow shapes.
 */

import type { TLShapeId, TLGeoShape, TLArrowShape } from 'tldraw';
import type { PlanNode, PlanEdge, NodeLayout, LayoutMap } from '../types';

/** Default dimensions for nodes without saved layout */
const DEFAULT_PHASE_WIDTH = 280;
const DEFAULT_PHASE_HEIGHT = 50;
const DEFAULT_TASK_WIDTH = 280;
const DEFAULT_TASK_HEIGHT = 80;

/** Colors for different statuses */
const STATUS_COLORS = {
  pending: '#e2e8f0', // slate-200
  in_progress: '#fef3c7', // amber-100
  completed: '#d1fae5', // emerald-100
} as const;

const STATUS_LABEL_COLORS = {
  pending: '#64748b', // slate-500
  in_progress: '#d97706', // amber-600
  completed: '#059669', // emerald-600
} as const;

/** Generate a TLDraw shape ID from a plan node ID */
export function toShapeId(nodeId: string): TLShapeId {
  return `shape:${nodeId}` as TLShapeId;
}

/** Extract plan node ID from a TLDraw shape ID */
export function fromShapeId(shapeId: TLShapeId): string {
  return shapeId.replace('shape:', '');
}

/** Create a TLDraw geo shape for a phase node */
export function createPhaseShape(
  node: PlanNode,
  layout?: NodeLayout
): Partial<TLGeoShape> {
  const x = layout?.x ?? 50;
  const y = layout?.y ?? 50;
  const width = layout?.width ?? DEFAULT_PHASE_WIDTH;
  const height = layout?.height ?? DEFAULT_PHASE_HEIGHT;

  return {
    id: toShapeId(node.id),
    type: 'geo',
    x,
    y,
    props: {
      geo: 'rectangle',
      w: width,
      h: height,
      color: 'light-blue',
      fill: 'solid',
      dash: 'draw',
      size: 'm',
      text: node.label,
      font: 'sans',
      align: 'middle',
      verticalAlign: 'middle',
    },
    meta: {
      nodeType: 'phase',
      nodeId: node.id,
      status: node.status,
    },
  };
}

/** Create a TLDraw geo shape for a task node */
export function createTaskShape(
  node: PlanNode,
  layout?: NodeLayout
): Partial<TLGeoShape> {
  const x = layout?.x ?? 50;
  const y = layout?.y ?? 150;
  const width = layout?.width ?? DEFAULT_TASK_WIDTH;
  const height = layout?.height ?? DEFAULT_TASK_HEIGHT;

  // Map status to TLDraw color
  const colorMap = {
    pending: 'grey',
    in_progress: 'yellow',
    completed: 'green',
  } as const;

  return {
    id: toShapeId(node.id),
    type: 'geo',
    x,
    y,
    props: {
      geo: 'rectangle',
      w: width,
      h: height,
      color: colorMap[node.status] ?? 'grey',
      fill: 'solid',
      dash: 'draw',
      size: 's',
      text: node.label,
      font: 'sans',
      align: 'start',
      verticalAlign: 'start',
    },
    meta: {
      nodeType: 'task',
      nodeId: node.id,
      status: node.status,
      phaseId: node.phaseId,
    },
  };
}

/** Create a TLDraw arrow shape for a dependency edge */
export function createDependencyArrow(
  edge: PlanEdge,
  fromNode: PlanNode,
  toNode: PlanNode,
  layouts: LayoutMap
): Partial<TLArrowShape> {
  const fromLayout = layouts[fromNode.id];
  const toLayout = layouts[toNode.id];

  // Calculate center points for binding
  const fromX = (fromLayout?.x ?? 50) + (fromLayout?.width ?? DEFAULT_TASK_WIDTH) / 2;
  const fromY = (fromLayout?.y ?? 50) + (fromLayout?.height ?? DEFAULT_TASK_HEIGHT) / 2;
  const toX = (toLayout?.x ?? 50) + (toLayout?.width ?? DEFAULT_TASK_WIDTH) / 2;
  const toY = (toLayout?.y ?? 150) + (toLayout?.height ?? DEFAULT_TASK_HEIGHT) / 2;

  return {
    id: toShapeId(edge.id),
    type: 'arrow',
    x: Math.min(fromX, toX),
    y: Math.min(fromY, toY),
    props: {
      color: 'black',
      fill: 'none',
      dash: 'solid',
      size: 's',
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
      start: {
        type: 'binding',
        boundShapeId: toShapeId(fromNode.id),
        normalizedAnchor: { x: 0.5, y: 1 },
        isExact: false,
        isPrecise: false,
      },
      end: {
        type: 'binding',
        boundShapeId: toShapeId(toNode.id),
        normalizedAnchor: { x: 0.5, y: 0 },
        isExact: false,
        isPrecise: false,
      },
    },
    meta: {
      edgeId: edge.id,
      fromNodeId: edge.from,
      toNodeId: edge.to,
    },
  };
}

/** Convert all plan nodes and edges to TLDraw shapes */
export function planToShapes(
  nodes: PlanNode[],
  edges: PlanEdge[],
  layouts: LayoutMap
): Array<Partial<TLGeoShape | TLArrowShape>> {
  const shapes: Array<Partial<TLGeoShape | TLArrowShape>> = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Create shapes for phases first
  for (const node of nodes) {
    if (node.type === 'phase') {
      shapes.push(createPhaseShape(node, layouts[node.id]));
    }
  }

  // Create shapes for tasks
  for (const node of nodes) {
    if (node.type === 'task') {
      shapes.push(createTaskShape(node, layouts[node.id]));
    }
  }

  // Create arrows for dependencies
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (fromNode && toNode) {
      shapes.push(createDependencyArrow(edge, fromNode, toNode, layouts));
    }
  }

  return shapes;
}

/** Extract layout from TLDraw shape */
export function shapeToLayout(shape: TLGeoShape): NodeLayout {
  return {
    x: shape.x,
    y: shape.y,
    width: shape.props.w,
    height: shape.props.h,
  };
}

/** Check if a shape represents a plan node (not an arrow) */
export function isPlanNodeShape(shape: { type: string; meta?: unknown }): boolean {
  const meta = shape.meta as { nodeType?: string } | undefined;
  return shape.type === 'geo' && (meta?.nodeType === 'phase' || meta?.nodeType === 'task');
}

/** Check if a shape represents a dependency arrow */
export function isDependencyArrow(shape: { type: string; meta?: unknown }): boolean {
  const meta = shape.meta as { edgeId?: string } | undefined;
  return shape.type === 'arrow' && !!meta?.edgeId;
}

export { STATUS_COLORS, STATUS_LABEL_COLORS };
