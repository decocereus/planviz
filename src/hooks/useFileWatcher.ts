/**
 * Hook for watching file changes via Tauri events
 */

import { useEffect, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export interface FileChangeEvent {
  path: string;
  fileType: 'plan' | 'layout';
}

export interface UseFileWatcherOptions {
  /** Called when the plan.md file changes */
  onPlanChange?: (path: string) => void;
  /** Called when the layout.json file changes */
  onLayoutChange?: (path: string) => void;
  /** Whether file watching is enabled */
  enabled?: boolean;
}

/**
 * Hook to watch for file changes and trigger callbacks
 */
export function useFileWatcher({
  onPlanChange,
  onLayoutChange,
  enabled = true,
}: UseFileWatcherOptions) {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<FileChangeEvent>('file-changed', (event) => {
        const { path, fileType } = event.payload;

        console.log(`File changed: ${fileType} - ${path}`);

        if (fileType === 'plan' && onPlanChange) {
          onPlanChange(path);
        } else if (fileType === 'layout' && onLayoutChange) {
          onLayoutChange(path);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [onPlanChange, onLayoutChange, enabled]);
}

/**
 * Start watching a plan file and its layout
 */
export async function startWatching(planPath: string): Promise<void> {
  await invoke('start_watching', { planPath });
}

/**
 * Stop watching files
 */
export async function stopWatching(): Promise<void> {
  await invoke('stop_watching');
}

/**
 * Get the currently watched plan path
 */
export async function getWatchedPlan(): Promise<string | null> {
  return invoke<string | null>('get_watched_plan');
}

export default useFileWatcher;
