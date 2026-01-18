/**
 * Zustand store for plan state management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { PlanDoc, LayoutMap, LayoutFile, PlanNode } from '../types';

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

interface PlanState {
  // Current plan data
  planPath: string | null;
  plan: PlanDoc | null;
  layouts: LayoutMap;
  planHash: string;

  // UI state
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPlan: (plan: PlanDoc, planPath: string, planHash: string) => void;
  setLayouts: (layouts: LayoutMap) => void;
  setSelectedNode: (nodeId: string | null) => void;
  clearPlan: () => void;

  // Async actions
  loadLayout: (planPath: string) => Promise<void>;
  saveLayout: () => Promise<void>;
  mergeLayout: (plan: PlanDoc, planPath: string, planHash: string) => Promise<void>;
}

/** Convert PlanNode to NodeInfo for Rust API */
function toNodeInfo(node: PlanNode): NodeInfo {
  return {
    id: node.id,
    nodeType: node.type,
    phaseId: node.phaseId ?? null,
  };
}

export const usePlanStore = create<PlanState>((set, get) => ({
  // Initial state
  planPath: null,
  plan: null,
  layouts: {},
  planHash: '',
  selectedNodeId: null,
  isLoading: false,
  error: null,

  // Synchronous actions
  setPlan: (plan, planPath, planHash) => {
    set({ plan, planPath, planHash, error: null });
  },

  setLayouts: (layouts) => {
    set({ layouts });
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  clearPlan: () => {
    set({
      planPath: null,
      plan: null,
      layouts: {},
      planHash: '',
      selectedNodeId: null,
      error: null,
    });
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

    set({ isLoading: true, error: null });
    try {
      const layoutFile: LayoutFile = {
        version: 1,
        planHash,
        layouts,
        lastModified: new Date().toISOString(),
      };
      await invoke('write_layout', { planPath, layout: layoutFile });
      set({ isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  mergeLayout: async (plan, planPath, planHash) => {
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
}));

export default usePlanStore;
