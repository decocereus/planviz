/**
 * Shared types for Plan Visualizer
 */

/** Task/Phase status */
export type Status = 'pending' | 'in_progress' | 'completed';

/** A task within a phase */
export interface PlanTask {
  id: string;
  content: string;
  status: Status;
  dependencies?: string[]; // IDs of tasks this depends on
}

/** A phase containing tasks */
export interface PlanPhase {
  id: string;
  title: string;
  tasks: PlanTask[];
}

/** A node in the visual plan (can be a phase or task) */
export interface PlanNode {
  id: string;
  type: 'phase' | 'task';
  label: string;
  status: Status;
  phaseId?: string; // For tasks, the parent phase ID
}

/** An edge representing a dependency between nodes */
export interface PlanEdge {
  id: string;
  from: string; // Source node ID
  to: string; // Target node ID
}

/** The complete plan document structure */
export interface PlanDoc {
  phases: PlanPhase[];
  nodes: PlanNode[];
  edges: PlanEdge[];
}

/** Position and size for a node on the canvas */
export interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Map of node IDs to their layout positions */
export type LayoutMap = Record<string, NodeLayout>;

/** Complete layout file structure */
export interface LayoutFile {
  version: number;
  planHash: string; // Hash of plan.md to detect changes
  layouts: LayoutMap;
  lastModified: string; // ISO timestamp
}

/** Chat message role */
export type ChatRole = 'user' | 'assistant' | 'system';

/** A chat message */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

/** Stream event types from ACP */
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_stop'
  | 'plan_update';

/** Stream event payload */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  planUpdate?: {
    nodeId: string;
    status?: Status;
    content?: string;
  };
}
