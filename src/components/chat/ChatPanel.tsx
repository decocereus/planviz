/**
 * ChatPanel - Main chat sidebar/panel component
 */

import { useEffect, useRef } from 'react';
import { MessageSquare, Trash2, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { AgentSelector } from './AgentSelector';
import {
  useChatStore,
  setupChatEventListener,
  teardownChatEventListener,
} from '../../store/chatStore';
import { useAgentStore } from '../../store/agentStore';

interface ChatPanelProps {
  className?: string;
  cwd?: string;
}

export function ChatPanel({ className, cwd = '.' }: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    useRealAgent,
    sendMessage,
    clearMessages,
    setUseRealAgent,
  } = useChatStore();

  const { session } = useAgentStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Set up event listener on mount
  useEffect(() => {
    setupChatEventListener();
    return () => {
      teardownChatEventListener();
    };
  }, []);

  // Update useRealAgent when session changes
  useEffect(() => {
    setUseRealAgent(session?.connected ?? false);
  }, [session?.connected, setUseRealAgent]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={`flex flex-col h-full bg-background border-l border-border ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Chat</span>
          {useRealAgent && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Live
            </span>
          )}
          {!useRealAgent && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              Mock
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Clear button */}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearMessages}
              disabled={isStreaming}
              title="Clear messages"
              className="h-8 w-8"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Agent Selector */}
      <AgentSelector cwd={cwd} />

      {/* Messages */}
      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground">
              {useRealAgent
                ? 'Connected to agent. Start a conversation.'
                : 'Using mock mode. Connect to an agent for real responses.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={isStreaming}
        placeholder={isStreaming ? 'Waiting for response...' : 'Type a message...'}
      />
    </div>
  );
}

export default ChatPanel;
