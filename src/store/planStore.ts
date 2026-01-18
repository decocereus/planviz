/**
 * Zustand store for plan state management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { PlanDoc, LayoutMap, LayoutFile, PlanNode, Status } from '../types';
import { debounce } from '../lib/utils';
import { serializePlan, computePlanHash } from '../parser/serializer';
import { parsePlan } from '../parser/parser';

/** Debounce delay for auto-save (ms) */
const AUTOSAVE_DELAY = 1000;

interface MergeResult {
  layout: LayoutFile;
  addedNodes: string[];
  removedNodes: string[];
}

interface NodeInfo {
  id: string;
  nodeType: string;
  phaseId: string | null;
}

/** Settings for reload behavior */
export interface ReloadSettings {
  /** Auto-reload on external changes (default: true) */
  autoReload: boolean;
}

interface PlanState {
  // Current plan data
  planPath: string | null;
  planTitle: string;
  plan: PlanDoc | null;
  layouts: LayoutMap;
  planHash: string;

  // UI state
  selectedNodeId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  hasExternalChanges: boolean;
  externalChangeType: 'plan' | 'layout' | null;
  error: string | null;

  // Settings
  settings: ReloadSettings;

  // Actions
  setPlan: (plan: PlanDoc, planPath: string, planHash: string, title?: string) => void;
  setLayouts: (layouts: LayoutMap) => void;
  updateLayoutsAndSave: (layouts: LayoutMap) => void;
  setSelectedNode: (nodeId: string | null) => void;
  updateNodeStatus: (nodeId: string, status: Status) => void;
  deleteNode: (nodeId: string) => void;
  addTask: (phaseId: string, content: string) => void;
  clearPlan: () => void;
  setSettings: (settings: Partial<ReloadSettings>) => void;
  notifyExternalChange: (type: 'plan' | 'layout') => void;
  dismissExternalChanges: () => void;

  // Async actions
  loadLayout: (planPath: string) => Promise<void>;
  saveLayout: () => Promise<void>;
  mergeLayout: (plan: PlanDoc, planPath: string, planHash: string, title?: string) => Promise<void>;
  reloadPlan: () => Promise<void>;
  reloadLayout: () => Promise<void>;
}

/** Convert PlanNode to NodeInfo for Rust API */
function toNodeInfo(node: PlanNode): NodeInfo {
  return {
    id: node.id,
    nodeType: node.type,
    phaseId: node.phaseId ?? null,
  };
}

/** Debounced save function (created once per store instance) */
let debouncedSave: (() => void) | null = null;

export const usePlanStore = create<PlanState>((set, get) => {
  // Create debounced save function that saves both layout and markdown
  const performSave = async () => {
    const { planPath, plan, planTitle, layouts } = get();
    if (!planPath || !plan) return;

    set({ isSaving: true });
    try {
      // Serialize and save markdown
      const markdown = serializePlan(plan, { title: planTitle });
      const newHash = computePlanHash(markdown);

      await writeTextFile(planPath, markdown);

      // Save layout
      const layoutFile: LayoutFile = {
        version: 1,
        planHash: newHash,
        layouts,
        lastModified: new Date().toISOString(),
      };
      await invoke('write_layout', { planPath, layout: layoutFile });

      set({ isSaving: false, isDirty: false, planHash: newHash });
      console.log('Plan and layout auto-saved');
    } catch (err) {
      console.error('Auto-save failed:', err);
      set({
        error: err instanceof Error ? err.message : String(err),
        isSaving: false,
      });
    }
  };

  debouncedSave = debounce(performSave, AUTOSAVE_DELAY);

  return {
    // Initial state
    planPath: null,
    planTitle: 'Untitled Plan',
    plan: null,
    layouts: {},
    planHash: '',
    hasExternalChanges: false,
    externalChangeType: null,
    settings: {
      autoReload: true,
    },
    selectedNodeId: null,
    isLoading: false,
    isSaving: false,
    isDirty: false,
    error: null,

    // Synchronous actions
    setPlan: (plan, planPath, planHash, title = 'Untitled Plan') => {
      set({ plan, planPath, planHash, planTitle: title, error: null });
    },

    setLayouts: (layouts) => {
      set({ layouts });
    },

    updateLayoutsAndSave: (layouts) => {
      const { planPath } = get();
      set({ layouts, isDirty: true });

      // Only auto-save if we have a file path (not demo mode)
      if (planPath && debouncedSave) {
        debouncedSave();
      }
    },

    setSelectedNode: (nodeId) => {
      set({ selectedNodeId: nodeId });
    },

    updateNodeStatus: (nodeId, status) => {
      const { plan } = get();
      if (!plan) return;

      // Update the node status
      const updatedNodes = plan.nodes.map((node) =>
        node.id === nodeId ? { ...node, status } : node
      );

      // Update the task in phases
      const updatedPhases = plan.phases.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((task) =>
          task.id === nodeId ? { ...task, status } : task
        ),
      }));

      // Recompute phase statuses based on their tasks
      const phasesWithStatus = updatedPhases.map((phase) => {
        const allCompleted = phase.tasks.every((t) => t.status === 'completed');
        const anyInProgress = phase.tasks.some(
          (t) => t.status === 'in_progress' || t.status === 'completed'
        );
        return phase;
      });

      // Update phase node statuses
      const nodesWithPhaseStatus = updatedNodes.map((node) => {
        if (node.type === 'phase') {
          const phase = phasesWithStatus.find((p) => p.id === node.id);
          if (phase && phase.tasks.length > 0) {
            const allCompleted = phase.tasks.every((t) => t.status === 'completed');
            const anyInProgress = phase.tasks.some(
              (t) => t.status === 'in_progress' || t.status === 'completed'
            );
            return {
              ...node,
              status: allCompleted ? 'completed' : anyInProgress ? 'in_progress' : 'pending',
            } as PlanNode;
          }
        }
        return node;
      });

      const { planPath } = get();
      set({
        plan: {
          ...plan,
          phases: phasesWithStatus,
          nodes: nodesWithPhaseStatus,
        },
        isDirty: true,
      });

      // Trigger auto-save if we have a file path
      if (planPath && debouncedSave) {
        debouncedSave();
      }
    },

    deleteNode: (nodeId) => {
      const { plan, layouts } = get();
      if (!plan) return;

      // Find the node to delete
      const nodeToDelete = plan.nodes.find((n) => n.id === nodeId);
      if (!nodeToDelete) return;

      // Remove node from nodes array
      const updatedNodes = plan.nodes.filter((n) => n.id !== nodeId);

      // Remove edges involving this node
      const updatedEdges = plan.edges.filter(
        (e) => e.from !== nodeId && e.to !== nodeId
      );

      // If it's a task, remove from phase
      let updatedPhases = plan.phases;
      if (nodeToDelete.type === 'task') {
        updatedPhases = plan.phases.map((phase) => ({
          ...phase,
          tasks: phase.tasks.filter((t) => t.id !== nodeId),
        }));
      }

      // If it's a phase, remove all its tasks too
      if (nodeToDelete.type === 'phase') {
        const taskIds = plan.nodes
          .filter((n) => n.phaseId === nodeId)
          .map((n) => n.id);

        updatedPhases = plan.phases.filter((p) => p.id !== nodeId);
        const remainingNodes = updatedNodes.filter(
          (n) => n.id !== nodeId && !taskIds.includes(n.id)
        );
        const remainingEdges = updatedEdges.filter(
          (e) => !taskIds.includes(e.from) && !taskIds.includes(e.to)
        );

        // Remove layouts for deleted nodes
        const updatedLayouts = { ...layouts };
        delete updatedLayouts[nodeId];
        taskIds.forEach((id) => delete updatedLayouts[id]);

        const { planPath } = get();
        set({
          plan: {
            ...plan,
            phases: updatedPhases,
            nodes: remainingNodes,
            edges: remainingEdges,
          },
          layouts: updatedLayouts,
          selectedNodeId: null,
          isDirty: true,
        });

        // Trigger auto-save
        if (planPath && debouncedSave) {
          debouncedSave();
        }
        return;
      }

      // Remove layout for deleted node
      const updatedLayouts = { ...layouts };
      delete updatedLayouts[nodeId];

      const { planPath } = get();
      set({
        plan: {
          ...plan,
          phases: updatedPhases,
          nodes: updatedNodes,
          edges: updatedEdges,
        },
        layouts: updatedLayouts,
        selectedNodeId: null,
        isDirty: true,
      });

      // Trigger auto-save
      if (planPath && debouncedSave) {
        debouncedSave();
      }
    },

    addTask: (phaseId, content) => {
      const { plan, layouts } = get();
      if (!plan) return;

      // Generate a new task ID
      const existingIds = plan.nodes.map((n) => n.id);
      let newId = 't1';
      let counter = 1;
      while (existingIds.includes(newId)) {
        counter++;
        newId = `t${counter}`;
      }

      // Find the phase
      const phaseIndex = plan.phases.findIndex((p) => p.id === phaseId);
      if (phaseIndex === -1) return;

      // Create new task
      const newTask = {
        id: newId,
        content,
        status: 'pending' as Status,
      };

      // Create new node
      const newNode: PlanNode = {
        id: newId,
        type: 'task',
        label: content,
        status: 'pending',
        phaseId,
      };

      // Calculate position for new task
      const phaseLayout = layouts[phaseId];
      const tasksInPhase = plan.nodes.filter(
        (n) => n.type === 'task' && n.phaseId === phaseId
      );
      const taskCount = tasksInPhase.length;
      const col = taskCount % 3;
      const row = Math.floor(taskCount / 3);

      const newLayout = {
        x: (phaseLayout?.x ?? 50) + col * 320,
        y: (phaseLayout?.y ?? 50) + 50 + 100 + row * 100,
        width: 280,
        height: 80,
      };

      // Update phases
      const updatedPhases = [...plan.phases];
      updatedPhases[phaseIndex] = {
        ...updatedPhases[phaseIndex],
        tasks: [...updatedPhases[phaseIndex].tasks, newTask],
      };

      const { planPath } = get();
      set({
        plan: {
          ...plan,
          phases: updatedPhases,
          nodes: [...plan.nodes, newNode],
        },
        layouts: {
          ...layouts,
          [newId]: newLayout,
        },
        selectedNodeId: newId,
        isDirty: true,
      });

      // Trigger auto-save
      if (planPath && debouncedSave) {
        debouncedSave();
      }
    },

    clearPlan: () => {
      set({
        planPath: null,
        planTitle: 'Untitled Plan',
        plan: null,
        layouts: {},
        planHash: '',
        selectedNodeId: null,
        isDirty: false,
        hasExternalChanges: false,
        externalChangeType: null,
        error: null,
      });
    },

    setSettings: (newSettings) => {
      const { settings } = get();
      set({ settings: { ...settings, ...newSettings } });
    },

    notifyExternalChange: (type) => {
      const { settings, isSaving } = get();

      // Ignore if we're currently saving (to avoid reacting to our own writes)
      if (isSaving) {
        console.log('Ignoring external change notification during save');
        return;
      }

      if (settings.autoReload) {
        // Auto-reload the changed file
        if (type === 'plan') {
          get().reloadPlan();
        } else {
          get().reloadLayout();
        }
      } else {
        // Show conflict banner
        set({ hasExternalChanges: true, externalChangeType: type });
      }
    },

    dismissExternalChanges: () => {
      set({ hasExternalChanges: false, externalChangeType: null });
    },

  // Async actions
  loadLayout: async (planPath) => {
    set({ isLoading: true, error: null });
    try {
      const layoutFile = await invoke<LayoutFile>('read_layout', { planPath });
      set({ layouts: layoutFile.layouts, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  saveLayout: async () => {
    const { planPath, layouts, planHash } = get();
    if (!planPath) return;

    set({ isSaving: true, error: null });
    try {
      const layoutFile: LayoutFile = {
        version: 1,
        planHash,
        layouts,
        lastModified: new Date().toISOString(),
      };
      await invoke('write_layout', { planPath, layout: layoutFile });
      set({ isSaving: false, isDirty: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isSaving: false,
      });
    }
  },

  mergeLayout: async (plan, planPath, planHash, title = 'Untitled Plan') => {
    set({ isLoading: true, error: null });
    try {
      const nodes = plan.nodes.map(toNodeInfo);
      const result = await invoke<MergeResult>('merge_layout', {
        planPath,
        nodes,
        planHash,
      });

      set({
        plan,
        planPath,
        planHash,
        planTitle: title,
        layouts: result.layout.layouts,
        isLoading: false,
      });

      // Log merge results for debugging
      if (result.addedNodes.length > 0) {
        console.log('Added nodes:', result.addedNodes);
      }
      if (result.removedNodes.length > 0) {
        console.log('Removed nodes:', result.removedNodes);
      }
    } catch (err) {
      // If merge fails (e.g., no layout file), generate fresh layout
      try {
        const nodes = plan.nodes.map(toNodeInfo);
        const layoutFile = await invoke<LayoutFile>('generate_layout', {
          nodes,
          planHash,
        });

        set({
          plan,
          planPath,
          planHash,
          planTitle: title,
          layouts: layoutFile.layouts,
          isLoading: false,
        });
      } catch (genErr) {
        set({
          error: genErr instanceof Error ? genErr.message : String(genErr),
          isLoading: false,
        });
      }
    }
  },

  reloadPlan: async () => {
    const { planPath } = get();
    if (!planPath) return;

    set({ isLoading: true, error: null });
    try {
      const content = await readTextFile(planPath);
      const result = parsePlan(content);

      if (!result.success) {
        set({
          error: `Failed to parse plan: ${result.errors.join(', ')}`,
          isLoading: false,
        });
        return;
      }

      const newHash = computePlanHash(content);
      const nodes = result.doc.nodes.map(toNodeInfo);

      // Merge with existing layout to preserve positions
      try {
        const mergeResult = await invoke<MergeResult>('merge_layout', {
          planPath,
          nodes,
          planHash: newHash,
        });

        set({
          plan: result.doc,
          planTitle: result.title,
          planHash: newHash,
          layouts: mergeResult.layout.layouts,
          isLoading: false,
          hasExternalChanges: false,
          externalChangeType: null,
          isDirty: false,
        });

        console.log('Plan reloaded from disk');
      } catch {
        // If merge fails, just update the plan without changing layouts
        set({
          plan: result.doc,
          planTitle: result.title,
          planHash: newHash,
          isLoading: false,
          hasExternalChanges: false,
          externalChangeType: null,
        });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  reloadLayout: async () => {
    const { planPath } = get();
    if (!planPath) return;

    set({ isLoading: true, error: null });
    try {
      const layoutFile = await invoke<LayoutFile>('read_layout', { planPath });

      set({
        layouts: layoutFile.layouts,
        planHash: layoutFile.planHash,
        isLoading: false,
        hasExternalChanges: false,
        externalChangeType: null,
        isDirty: false,
      });

      console.log('Layout reloaded from disk');
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },
  };
});

export default usePlanStore;
