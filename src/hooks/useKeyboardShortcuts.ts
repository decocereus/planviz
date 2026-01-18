/**
 * Keyboard shortcuts hook
 *
 * Provides global keyboard shortcuts for the application.
 */

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/** Check if an element is an input field */
function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    element.isContentEditable
  );
}

/** Create a keyboard shortcut handler */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields
      // unless the shortcut specifically requires modifier keys
      const isInput = isInputElement(event.target);

      for (const shortcut of shortcuts) {
        const key = shortcut.key.toLowerCase();
        const eventKey = event.key.toLowerCase();

        // Check if the key matches
        if (eventKey !== key) continue;

        // Check modifier keys
        const ctrlOrMeta = shortcut.ctrl || shortcut.meta;
        const hasCtrlOrMeta = event.ctrlKey || event.metaKey;

        if (ctrlOrMeta && !hasCtrlOrMeta) continue;
        if (!ctrlOrMeta && hasCtrlOrMeta) continue;

        if (shortcut.shift && !event.shiftKey) continue;
        if (!shortcut.shift && event.shiftKey) continue;

        if (shortcut.alt && !event.altKey) continue;
        if (!shortcut.alt && event.altKey) continue;

        // If in input field, only trigger shortcuts with modifier keys
        if (isInput && !ctrlOrMeta) continue;

        // Prevent default and execute action
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
        return;
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Format shortcut key for display */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  if (shortcut.ctrl || shortcut.meta) {
    parts.push(isMac ? '\u2318' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '\u21E7' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '\u2325' : 'Alt');
  }

  // Format the key
  let keyDisplay = shortcut.key.toUpperCase();
  if (shortcut.key === 'escape') keyDisplay = 'Esc';
  if (shortcut.key === 'enter') keyDisplay = '\u23CE';
  if (shortcut.key === 'backspace') keyDisplay = '\u232B';
  if (shortcut.key === 'delete') keyDisplay = 'Del';
  if (shortcut.key === 'arrowup') keyDisplay = '\u2191';
  if (shortcut.key === 'arrowdown') keyDisplay = '\u2193';
  if (shortcut.key === 'arrowleft') keyDisplay = '\u2190';
  if (shortcut.key === 'arrowright') keyDisplay = '\u2192';

  parts.push(keyDisplay);
  return parts.join(isMac ? '' : '+');
}

export default useKeyboardShortcuts;
