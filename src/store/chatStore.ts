/**
 * Zustand store for chat state management
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ChatMessage, StreamEvent, Status } from '../types';
import { usePlanStore } from './planStore';

/** Generate a unique message ID */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface ChatState {
  // Messages
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;

  // Connection
  isConnected: boolean;
  connectionError: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  appendStreamContent: (content: string) => void;
  finalizeStream: () => void;
  clearMessages: () => void;
  setConnectionStatus: (connected: boolean, error?: string) => void;

  // Event handling
  handleStreamEvent: (event: StreamEvent) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  isConnected: false,
  connectionError: null,

  sendMessage: async (content: string) => {
    const { isStreaming } = get();
    if (isStreaming) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Create placeholder for assistant response
    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      isStreaming: true,
      streamingMessageId: assistantMessageId,
    }));

    try {
      // Invoke the mock chat command
      await invoke('send_chat_message', { message: content });
    } catch (err) {
      // On error, update the assistant message with error
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `Error: ${err instanceof Error ? err.message : String(err)}`,
                isStreaming: false,
              }
            : msg
        ),
        isStreaming: false,
        streamingMessageId: null,
      }));
    }
  },

  appendStreamContent: (content: string) => {
    const { streamingMessageId } = get();
    if (!streamingMessageId) return;

    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === streamingMessageId
          ? { ...msg, content: msg.content + content }
          : msg
      ),
    }));
  },

  finalizeStream: () => {
    const { streamingMessageId } = get();
    if (!streamingMessageId) return;

    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === streamingMessageId
          ? { ...msg, isStreaming: false }
          : msg
      ),
      isStreaming: false,
      streamingMessageId: null,
    }));
  },

  clearMessages: () => {
    set({ messages: [], isStreaming: false, streamingMessageId: null });
  },

  setConnectionStatus: (connected, error) => {
    set({
      isConnected: connected,
      connectionError: error ?? null,
    });
  },

  handleStreamEvent: (event: StreamEvent) => {
    const { appendStreamContent, finalizeStream } = get();

    switch (event.type) {
      case 'content_block_delta':
        if (event.content) {
          appendStreamContent(event.content);
        }
        break;

      case 'message_stop':
        finalizeStream();
        break;

      case 'plan_update':
        if (event.planUpdate) {
          const { nodeId, status } = event.planUpdate;
          if (status) {
            // Update the node status in the plan store
            usePlanStore.getState().updateNodeStatus(nodeId, status as Status);
            console.log(`Plan update: ${nodeId} -> ${status}`);
          }
        }
        break;

      default:
        // Other events (message_start, content_block_start, etc.) are handled implicitly
        break;
    }
  },
}));

/** Set up event listener for stream events from Tauri backend */
let unlistenFn: UnlistenFn | null = null;

export async function setupChatEventListener(): Promise<void> {
  if (unlistenFn) {
    unlistenFn();
  }

  unlistenFn = await listen<StreamEvent>('chat-stream', (event) => {
    useChatStore.getState().handleStreamEvent(event.payload);
  });

  useChatStore.getState().setConnectionStatus(true);
}

export async function teardownChatEventListener(): Promise<void> {
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }

  useChatStore.getState().setConnectionStatus(false);
}

export default useChatStore;
