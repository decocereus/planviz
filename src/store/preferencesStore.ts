/**
 * Zustand store for user preferences management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { LaunchConfig, UserPreferences } from '../types';

interface PreferencesState {
  // Launch config (from CLI args)
  launchConfig: LaunchConfig | null;
  isLoadingConfig: boolean;

  // User preferences
  preferences: UserPreferences | null;
  isLoadingPreferences: boolean;

  // Actions
  loadLaunchConfig: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  setLastPlan: (planPath: string) => Promise<void>;
  setPlanAgent: (planPath: string, agent: string) => Promise<void>;
  getPlanAgent: (planPath: string) => Promise<string | null>;
  setDefaultAgent: (agent: string) => Promise<void>;
  removeRecentPlan: (planPath: string) => Promise<void>;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  // Initial state
  launchConfig: null,
  isLoadingConfig: false,
  preferences: null,
  isLoadingPreferences: false,

  loadLaunchConfig: async () => {
    set({ isLoadingConfig: true });
    try {
      const config = await invoke<LaunchConfig>('get_launch_config');
      set({ launchConfig: config, isLoadingConfig: false });
    } catch (err) {
      console.error('Failed to load launch config:', err);
      set({
        launchConfig: { fromCli: false },
        isLoadingConfig: false,
      });
    }
  },

  loadPreferences: async () => {
    set({ isLoadingPreferences: true });
    try {
      const prefs = await invoke<UserPreferences>('get_preferences');
      set({ preferences: prefs, isLoadingPreferences: false });
    } catch (err) {
      console.error('Failed to load preferences:', err);
      set({
        preferences: {
          recentPlans: [],
          planPreferences: {},
        },
        isLoadingPreferences: false,
      });
    }
  },

  setLastPlan: async (planPath: string) => {
    try {
      await invoke('set_last_plan', { planPath });
      // Reload preferences to get updated recent plans
      await get().loadPreferences();
    } catch (err) {
      console.error('Failed to set last plan:', err);
    }
  },

  setPlanAgent: async (planPath: string, agent: string) => {
    try {
      await invoke('set_plan_agent', { planPath, agent });
      // Update local state
      const { preferences } = get();
      if (preferences) {
        const planPrefs = preferences.planPreferences[planPath] || {};
        set({
          preferences: {
            ...preferences,
            planPreferences: {
              ...preferences.planPreferences,
              [planPath]: { ...planPrefs, lastAgent: agent },
            },
          },
        });
      }
    } catch (err) {
      console.error('Failed to set plan agent:', err);
    }
  },

  getPlanAgent: async (planPath: string) => {
    try {
      return await invoke<string | null>('get_plan_agent', { planPath });
    } catch (err) {
      console.error('Failed to get plan agent:', err);
      return null;
    }
  },

  setDefaultAgent: async (agent: string) => {
    try {
      await invoke('set_default_agent', { agent });
      const { preferences } = get();
      if (preferences) {
        set({
          preferences: { ...preferences, defaultAgent: agent },
        });
      }
    } catch (err) {
      console.error('Failed to set default agent:', err);
    }
  },

  removeRecentPlan: async (planPath: string) => {
    try {
      await invoke('remove_recent_plan', { planPath });
      await get().loadPreferences();
    } catch (err) {
      console.error('Failed to remove recent plan:', err);
    }
  },
}));

export default usePreferencesStore;
