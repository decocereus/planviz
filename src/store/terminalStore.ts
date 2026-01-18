/**
 * Zustand store for terminal session management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** PTY output event from backend */
interface PtyOutputEvent {
  sessionId: string;
  data: string;
}

/** PTY exit event from backend */
interface PtyExitEvent {
  sessionId: string;
  exitCode: number | null;
}

/** Terminal line with metadata */
interface TerminalLine {
  id: string;
  content: string;
  timestamp: number;
  type: 'output' | 'input' | 'system';
}

interface TerminalState {
  // Session state
  sessionId: string | null;
  isRunning: boolean;
  exitCode: number | null;

  // Output buffer
  lines: TerminalLine[];
  rawBuffer: string;

  // Size
  rows: number;
  cols: number;

  // Actions
  createSession: (cwd: string) => Promise<void>;
  writeInput: (data: string) => Promise<void>;
  resize: (rows: number, cols: number) => Promise<void>;
  stopSession: () => Promise<void>;
  clearOutput: () => void;

  // Internal
  appendOutput: (data: string) => void;
  appendLine: (line: Omit<TerminalLine, 'id' | 'timestamp'>) => void;
  setExitCode: (code: number | null) => void;
  setRunning: (running: boolean) => void;
}

// Event listeners
let outputUnlisten: UnlistenFn | null = null;
let exitUnlisten: UnlistenFn | null = null;

/** Set up terminal event listeners */
export async function setupTerminalEventListener(): Promise<void> {
  const store = useTerminalStore.getState();

  // Listen for PTY output
  outputUnlisten = await listen<PtyOutputEvent>('pty-output', (event) => {
    if (event.payload.sessionId === store.sessionId) {
      store.appendOutput(event.payload.data);
    }
  });

  // Listen for PTY exit
  exitUnlisten = await listen<PtyExitEvent>('pty-exit', (event) => {
    if (event.payload.sessionId === store.sessionId) {
      store.setExitCode(event.payload.exitCode);
      store.setRunning(false);
      store.appendLine({
        type: 'system',
        content: `Process exited with code ${event.payload.exitCode ?? 'unknown'}`,
      });
    }
  });
}

/** Tear down terminal event listeners */
export function teardownTerminalEventListener(): void {
  if (outputUnlisten) {
    outputUnlisten();
    outputUnlisten = null;
  }
  if (exitUnlisten) {
    exitUnlisten();
    exitUnlisten = null;
  }
}

/** Generate unique line ID */
function generateLineId(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Strip ANSI escape codes for display */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  // Initial state
  sessionId: null,
  isRunning: false,
  exitCode: null,
  lines: [],
  rawBuffer: '',
  rows: 24,
  cols: 80,

  createSession: async (cwd: string) => {
    const sessionId = `terminal_${Date.now()}`;

    try {
      // Create PTY session
      await invoke('pty_create_session', { sessionId });

      // Spawn shell
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh';
      await invoke('pty_spawn', {
        sessionId,
        command: shell,
        args: [],
        cwd,
        env: null,
      });

      set({
        sessionId,
        isRunning: true,
        exitCode: null,
        lines: [],
        rawBuffer: '',
      });

      get().appendLine({
        type: 'system',
        content: `Terminal session started in ${cwd}`,
      });
    } catch (err) {
      console.error('Failed to create terminal session:', err);
      get().appendLine({
        type: 'system',
        content: `Failed to start terminal: ${err}`,
      });
    }
  },

  writeInput: async (data: string) => {
    const { sessionId, isRunning } = get();
    if (!sessionId || !isRunning) return;

    try {
      await invoke('pty_write', { sessionId, data });
    } catch (err) {
      console.error('Failed to write to terminal:', err);
    }
  },

  resize: async (rows: number, cols: number) => {
    const { sessionId, isRunning } = get();
    set({ rows, cols });

    if (!sessionId || !isRunning) return;

    try {
      await invoke('pty_resize', { sessionId, rows, cols });
    } catch (err) {
      console.error('Failed to resize terminal:', err);
    }
  },

  stopSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    try {
      await invoke('pty_stop', { sessionId });
      await invoke('pty_remove', { sessionId });
    } catch (err) {
      console.error('Failed to stop terminal:', err);
    }

    set({
      sessionId: null,
      isRunning: false,
    });
  },

  clearOutput: () => {
    set({ lines: [], rawBuffer: '' });
  },

  appendOutput: (data: string) => {
    const { rawBuffer, lines } = get();
    const newBuffer = rawBuffer + data;

    // Split by newlines, keeping partial lines in buffer
    const parts = newBuffer.split('\n');
    const completeLines = parts.slice(0, -1);
    const partialLine = parts[parts.length - 1];

    const newLines = completeLines.map((content) => ({
      id: generateLineId(),
      content: stripAnsi(content),
      timestamp: Date.now(),
      type: 'output' as const,
    }));

    // Limit total lines to prevent memory issues
    const maxLines = 1000;
    const allLines = [...lines, ...newLines].slice(-maxLines);

    set({
      lines: allLines,
      rawBuffer: partialLine,
    });
  },

  appendLine: (line) => {
    const newLine: TerminalLine = {
      ...line,
      id: generateLineId(),
      timestamp: Date.now(),
    };

    set((state) => ({
      lines: [...state.lines, newLine].slice(-1000),
    }));
  },

  setExitCode: (code) => {
    set({ exitCode: code });
  },

  setRunning: (running) => {
    set({ isRunning: running });
  },
}));

export default useTerminalStore;
