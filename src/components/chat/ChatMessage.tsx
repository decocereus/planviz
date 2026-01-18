/**
 * ChatMessage - Renders a single chat message
 */

import { User, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ChatMessage as ChatMessageType } from '../../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser ? 'bg-muted/50' : 'bg-background'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isSystem
              ? 'bg-muted text-muted-foreground'
              : 'bg-orange-500 text-white'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {message.content || (message.isStreaming && (
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse animation-delay-150" />
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse animation-delay-300" />
            </span>
          ))}
          {message.isStreaming && message.content && (
            <span className="inline-block w-2 h-4 bg-orange-500 animate-pulse ml-0.5" />
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;
