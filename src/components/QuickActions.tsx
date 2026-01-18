/**
 * QuickActions - Floating toolbar for node actions
 *
 * Shows quick action buttons when a node is selected.
 */

import { Check, Circle, Clock, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import type { Status } from '../types';

export interface QuickActionsProps {
  selectedNodeId: string | null;
  nodeType: 'phase' | 'task' | null;
  currentStatus: Status | null;
  onStatusChange: (nodeId: string, status: Status) => void;
  onDelete: (nodeId: string) => void;
  onAddTask?: (phaseId: string) => void;
}

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    label: 'Pending',
    color: 'text-slate-500',
  },
  in_progress: {
    icon: Clock,
    label: 'In Progress',
    color: 'text-amber-600',
  },
  completed: {
    icon: Check,
    label: 'Completed',
    color: 'text-emerald-600',
  },
} as const;

export function QuickActions({
  selectedNodeId,
  nodeType,
  currentStatus,
  onStatusChange,
  onDelete,
  onAddTask,
}: QuickActionsProps) {
  if (!selectedNodeId || !currentStatus) {
    return null;
  }

  const handleStatusClick = (status: Status) => {
    if (status !== currentStatus) {
      onStatusChange(selectedNodeId, status);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border bg-white/95 shadow-lg backdrop-blur-sm">
        {/* Status buttons */}
        {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(
          ([status, config]) => {
            const Icon = config.icon;
            const isActive = status === currentStatus;
            return (
              <Button
                key={status}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-8 gap-1.5 ${isActive ? config.color : 'text-muted-foreground'}`}
                onClick={() => handleStatusClick(status)}
                title={`Mark as ${config.label}`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{config.label}</span>
              </Button>
            );
          }
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* Add task button (only for phases) */}
        {nodeType === 'phase' && onAddTask && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={() => onAddTask(selectedNodeId)}
            title="Add task to this phase"
          >
            <Plus className="h-4 w-4" />
            <span className="text-xs">Add Task</span>
          </Button>
        )}

        {/* Delete button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(selectedNodeId)}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default QuickActions;
