/**
 * AgentSelector - Component for selecting and connecting to AI agents
 */

import { useEffect, useRef } from 'react';
import { Bot, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useAgentStore, setupAgentEventListener, teardownAgentEventListener } from '../../store/agentStore';
import { usePreferencesStore } from '../../store/preferencesStore';
import type { AgentType } from '../../types';
import { cn } from '../../lib/utils';

const AGENT_INFO: Record<AgentType, { name: string; description: string }> = {
  claude_code: {
    name: 'Claude Code',
    description: 'Anthropic Claude Code CLI',
  },
  codex: {
    name: 'Codex',
    description: 'OpenAI Codex CLI',
  },
  opencode: {
    name: 'OpenCode',
    description: 'OpenCode ACP Client',
  },
};

interface AgentSelectorProps {
  cwd: string;
  planPath?: string;
  className?: string;
}

export function AgentSelector({ cwd, planPath, className }: AgentSelectorProps) {
  const {
    session,
    isConnecting,
    connectionError,
    availableAgents,
    isCheckingAgents,
    connect,
    disconnect,
    checkAvailableAgents,
    clearError,
  } = useAgentStore();

  const { launchConfig, preferences, setPlanAgent } = usePreferencesStore();

  // Track if we've attempted auto-connect
  const autoConnectAttempted = useRef(false);

  // Check available agents on mount
  useEffect(() => {
    checkAvailableAgents();
    setupAgentEventListener();

    return () => {
      teardownAgentEventListener();
    };
  }, [checkAvailableAgents]);

  // Auto-connect based on CLI args or preferences
  useEffect(() => {
    if (autoConnectAttempted.current || isCheckingAgents || isConnecting || session?.connected) {
      return;
    }

    // Determine which agent to auto-connect to
    let targetAgent: AgentType | null = null;

    // Priority 1: CLI --agent argument
    if (launchConfig?.agent) {
      const normalized = launchConfig.agent.replace('-', '_') as AgentType;
      if (normalized in AGENT_INFO) {
        targetAgent = normalized;
      }
    }

    // Priority 2: Last-used agent for this plan
    if (!targetAgent && planPath && preferences?.planPreferences[planPath]?.lastAgent) {
      const lastAgent = preferences.planPreferences[planPath].lastAgent as AgentType;
      if (lastAgent in AGENT_INFO) {
        targetAgent = lastAgent;
      }
    }

    // Priority 3: Default agent
    if (!targetAgent && preferences?.defaultAgent) {
      const defaultAgent = preferences.defaultAgent.replace('-', '_') as AgentType;
      if (defaultAgent in AGENT_INFO) {
        targetAgent = defaultAgent;
      }
    }

    // Auto-connect if we have a target agent and it's available
    if (targetAgent && availableAgents[targetAgent]?.found && availableAgents[targetAgent]?.cliAvailable) {
      autoConnectAttempted.current = true;
      connect(targetAgent, cwd);
    }
  }, [
    launchConfig,
    preferences,
    planPath,
    availableAgents,
    isCheckingAgents,
    isConnecting,
    session?.connected,
    connect,
    cwd,
  ]);

  const handleConnect = async (agentType: AgentType) => {
    await connect(agentType, cwd);
    // Save the agent selection for this plan
    if (planPath) {
      await setPlanAgent(planPath, agentType);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  // If connected, show connected status
  if (session?.connected) {
    const agentInfo = AGENT_INFO[session.agentType];

    return (
      <div className={cn('p-3 border-b border-border', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-medium">{agentInfo.name}</div>
              <div className="text-xs text-muted-foreground">
                {session.status || 'Connected'}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            className="h-8"
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  // Show agent selection
  return (
    <div className={cn('p-3 border-b border-border', className)}>
      <div className="text-sm font-medium mb-2">Select Agent</div>

      {connectionError && (
        <div className="flex items-center gap-2 p-2 mb-2 text-sm text-red-600 bg-red-50 rounded-md">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{connectionError}</span>
          <button onClick={clearError} className="hover:bg-red-100 rounded p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {(Object.keys(AGENT_INFO) as AgentType[]).map((agentType) => {
          const info = AGENT_INFO[agentType];
          const status = availableAgents[agentType];
          const isAvailable = status?.found && status?.cliAvailable;
          const isLoading = isCheckingAgents || (isConnecting && session?.agentType === agentType);

          return (
            <button
              key={agentType}
              onClick={() => handleConnect(agentType)}
              disabled={!isAvailable || isConnecting}
              className={cn(
                'w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors',
                isAvailable
                  ? 'hover:bg-muted cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  isAvailable ? 'bg-primary/10' : 'bg-muted'
                )}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isAvailable ? (
                  <Check className="w-4 h-4 text-primary" />
                ) : (
                  <X className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{info.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {status?.error || (isAvailable ? info.description : 'Not available')}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {isCheckingAgents && (
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking available agents...
        </div>
      )}
    </div>
  );
}

export default AgentSelector;
