/**
 * Zustand store for agent state management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AgentType, AgentSession, AgentStatusEvent, CredentialStatus } from '../types';

interface AgentState {
  // Session state
  session: AgentSession | null;
  isConnecting: boolean;
  connectionError: string | null;

  // Agent availability
  availableAgents: Record<AgentType, CredentialStatus | null>;
  isCheckingAgents: boolean;

  // Actions
  connect: (agentType: AgentType, cwd: string) => Promise<void>;
  disconnect: () => Promise<void>;
  checkAvailableAgents: () => Promise<void>;
  handleStatusEvent: (event: AgentStatusEvent) => void;
  clearError: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  session: null,
  isConnecting: false,
  connectionError: null,
  availableAgents: {
    claude_code: null,
    codex: null,
    opencode: null,
  },
  isCheckingAgents: false,

  connect: async (agentType: AgentType, cwd: string) => {
    const { session, isConnecting } = get();

    if (isConnecting) return;
    if (session?.connected) {
      // Disconnect first
      await get().disconnect();
    }

    set({ isConnecting: true, connectionError: null });

    try {
      const newSession = await invoke<AgentSession>('agent_connect', {
        agentType,
        cwd,
      });

      set({
        session: newSession,
        isConnecting: false,
      });
    } catch (err) {
      set({
        connectionError: err instanceof Error ? err.message : String(err),
        isConnecting: false,
      });
    }
  },

  disconnect: async () => {
    try {
      await invoke('agent_disconnect');
      set({ session: null, connectionError: null });
    } catch (err) {
      set({
        connectionError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  checkAvailableAgents: async () => {
    set({ isCheckingAgents: true });

    const agents: AgentType[] = ['claude_code', 'codex', 'opencode'];
    const results: Record<AgentType, CredentialStatus | null> = {
      claude_code: null,
      codex: null,
      opencode: null,
    };

    for (const agent of agents) {
      try {
        const status = await invoke<CredentialStatus>('check_credentials', {
          agent,
        });
        results[agent] = status;
      } catch (err) {
        results[agent] = {
          found: false,
          cliAvailable: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    set({
      availableAgents: results,
      isCheckingAgents: false,
    });
  },

  handleStatusEvent: (event: AgentStatusEvent) => {
    const { session } = get();

    if (session && session.id === event.sessionId) {
      set({
        session: {
          ...session,
          connected: event.connected,
          status: event.message,
        },
        connectionError: event.error ?? null,
      });
    }
  },

  clearError: () => {
    set({ connectionError: null });
  },
}));

/** Set up event listener for agent status events */
let unlistenFn: UnlistenFn | null = null;

export async function setupAgentEventListener(): Promise<void> {
  if (unlistenFn) {
    unlistenFn();
  }

  unlistenFn = await listen<AgentStatusEvent>('agent-status', (event) => {
    useAgentStore.getState().handleStatusEvent(event.payload);
  });
}

export async function teardownAgentEventListener(): Promise<void> {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}

export default useAgentStore;
