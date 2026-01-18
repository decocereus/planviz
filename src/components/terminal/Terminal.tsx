/**
 * Terminal - PTY terminal display and input component
 */

import { useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Terminal as TerminalIcon, X, Play, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import {
  useTerminalStore,
  setupTerminalEventListener,
  teardownTerminalEventListener,
} from '../../store/terminalStore';
import { cn } from '../../lib/utils';

interface TerminalProps {
  cwd: string;
  className?: string;
}

export function Terminal({ cwd, className }: TerminalProps) {
  const {
    sessionId,
    isRunning,
    exitCode,
    lines,
    rawBuffer,
    createSession,
    writeInput,
    resize,
    stopSession,
    clearOutput,
  } = useTerminalStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set up event listeners
  useEffect(() => {
    setupTerminalEventListener();
    return () => {
      teardownTerminalEventListener();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, rawBuffer]);

  // Handle resize when container changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Calculate rows and cols based on font size
        const charWidth = 8; // approximate monospace char width
        const charHeight = 16; // approximate line height
        const cols = Math.floor(entry.contentRect.width / charWidth);
        const rows = Math.floor(entry.contentRect.height / charHeight);

        if (cols > 0 && rows > 0) {
          resize(rows, cols);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [resize]);

  const handleStart = useCallback(() => {
    createSession(cwd);
  }, [createSession, cwd]);

  const handleStop = useCallback(() => {
    stopSession();
  }, [stopSession]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const input = inputRef.current?.value ?? '';
        writeInput(input + '\n');
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      } else if (e.key === 'c' && e.ctrlKey) {
        // Send Ctrl+C
        writeInput('\x03');
      } else if (e.key === 'd' && e.ctrlKey) {
        // Send Ctrl+D (EOF)
        writeInput('\x04');
      }
    },
    [writeInput]
  );

  return (
    <div className={cn('flex flex-col h-full bg-black text-green-400 font-mono text-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4" />
          <span className="text-sm">Terminal</span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
          {!isRunning && exitCode !== null && (
            <span className="text-xs text-zinc-400">
              (exited: {exitCode})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!sessionId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStart}
              className="h-6 w-6 text-green-400 hover:text-green-300 hover:bg-zinc-800"
              title="Start terminal"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          {isRunning && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStop}
              className="h-6 w-6 text-red-400 hover:text-red-300 hover:bg-zinc-800"
              title="Stop terminal"
            >
              <Square className="h-3 w-3" />
            </Button>
          )}
          {lines.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearOutput}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800"
              title="Clear output"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Output area */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-2 min-h-full">
            {lines.length === 0 && !rawBuffer && !sessionId && (
              <div className="text-zinc-500 italic">
                Click the play button to start a terminal session
              </div>
            )}
            {lines.map((line) => (
              <div
                key={line.id}
                className={cn(
                  'whitespace-pre-wrap break-all',
                  line.type === 'system' && 'text-yellow-400 italic',
                  line.type === 'input' && 'text-blue-400'
                )}
              >
                {line.content || '\u00A0'}
              </div>
            ))}
            {rawBuffer && (
              <div className="whitespace-pre-wrap break-all">
                {rawBuffer}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input area */}
      {isRunning && (
        <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border-t border-zinc-700">
          <span className="text-green-500">$</span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-green-400 placeholder-zinc-500"
            placeholder="Type command..."
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export default Terminal;
