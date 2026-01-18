import { useState, useCallback, useEffect } from 'react';
import { FileText, FolderOpen, X, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

import { Button } from './components/ui/button';
import { QuickActions } from './components/QuickActions';
import { ConflictBanner } from './components/ConflictBanner';
import { ChatPanel } from './components/chat';
import { PlanCanvas } from './canvas';
import { usePlanStore } from './store';
import { parsePlan } from './parser';
import { useFileWatcher, startWatching, stopWatching } from './hooks';
import type { PlanDoc, LayoutMap, Status } from './types';

/** Simple hash function for plan content */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/** Sample plan for demo mode */
const SAMPLE_PLAN: PlanDoc = {
  phases: [
    {
      id: 'phase_0',
      title: 'Phase 0 — Bootstrap',
      tasks: [
        { id: 't1', content: 'Initialize project', status: 'completed' },
        { id: 't2', content: 'Add dependencies', status: 'completed' },
      ],
    },
    {
      id: 'phase_1',
      title: 'Phase 1 — Core Features',
      tasks: [
        { id: 't3', content: 'Build parser', status: 'completed', dependencies: ['t1'] },
        { id: 't4', content: 'Create canvas', status: 'in_progress', dependencies: ['t2'] },
        { id: 't5', content: 'Add state management', status: 'pending', dependencies: ['t3', 't4'] },
      ],
    },
  ],
  nodes: [
    { id: 'phase_0', type: 'phase', label: 'Bootstrap', status: 'completed' },
    { id: 't1', type: 'task', label: 'Initialize project', status: 'completed', phaseId: 'phase_0' },
    { id: 't2', type: 'task', label: 'Add dependencies', status: 'completed', phaseId: 'phase_0' },
    { id: 'phase_1', type: 'phase', label: 'Core Features', status: 'in_progress' },
    { id: 't3', type: 'task', label: 'Build parser', status: 'completed', phaseId: 'phase_1' },
    { id: 't4', type: 'task', label: 'Create canvas', status: 'in_progress', phaseId: 'phase_1' },
    { id: 't5', type: 'task', label: 'Add state management', status: 'pending', phaseId: 'phase_1' },
  ],
  edges: [
    { id: 'edge_t1_t3', from: 't1', to: 't3' },
    { id: 'edge_t2_t4', from: 't2', to: 't4' },
    { id: 'edge_t3_t5', from: 't3', to: 't5' },
    { id: 'edge_t4_t5', from: 't4', to: 't5' },
  ],
};

/** Sample layout for demo mode */
const SAMPLE_LAYOUTS: LayoutMap = {
  phase_0: { x: 50, y: 50, width: 200, height: 50 },
  t1: { x: 50, y: 130, width: 280, height: 80 },
  t2: { x: 370, y: 130, width: 280, height: 80 },
  phase_1: { x: 50, y: 260, width: 200, height: 50 },
  t3: { x: 50, y: 340, width: 280, height: 80 },
  t4: { x: 370, y: 340, width: 280, height: 80 },
  t5: { x: 210, y: 460, width: 280, height: 80 },
};

function WelcomeScreen({ onOpenPlan, onDemoMode }: { onOpenPlan: () => void; onDemoMode: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Plan Visualizer</h1>
        <p className="text-muted-foreground max-w-md">
          Visualize your plan.md as an interactive canvas with phases, tasks, and dependencies.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={onOpenPlan} size="lg">
          <FolderOpen className="mr-2 h-4 w-4" />
          Open Plan
        </Button>
        <Button onClick={onDemoMode} variant="outline" size="lg">
          <FileText className="mr-2 h-4 w-4" />
          Demo Mode
        </Button>
      </div>
    </div>
  );
}

function CanvasHeader({
  planPath,
  onClose,
  isDirty,
  isSaving,
  isChatOpen,
  onToggleChat,
}: {
  planPath: string | null;
  onClose: () => void;
  isDirty: boolean;
  isSaving: boolean;
  isChatOpen: boolean;
  onToggleChat: () => void;
}) {
  const fileName = planPath ? planPath.split('/').pop() : 'Demo Plan';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-white/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{fileName}</span>
        {isDirty && !isSaving && (
          <span className="text-xs text-muted-foreground">(unsaved)</span>
        )}
        {isSaving && (
          <span className="text-xs text-muted-foreground">Saving...</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onToggleChat} title={isChatOpen ? 'Hide chat' : 'Show chat'}>
          {isChatOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const {
    plan,
    planPath,
    layouts,
    setLayouts,
    updateLayoutsAndSave,
    setPlan,
    clearPlan,
    mergeLayout,
    selectedNodeId,
    setSelectedNode,
    updateNodeStatus,
    deleteNode,
    addTask,
    isDirty,
    isSaving,
    hasExternalChanges,
    externalChangeType,
    notifyExternalChange,
    dismissExternalChanges,
    reloadPlan,
    reloadLayout,
  } = usePlanStore();

  const [isCanvasView, setIsCanvasView] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Handle external file changes
  const handleExternalPlanChange = useCallback(
    (_path: string) => {
      notifyExternalChange('plan');
    },
    [notifyExternalChange]
  );

  const handleExternalLayoutChange = useCallback(
    (_path: string) => {
      notifyExternalChange('layout');
    },
    [notifyExternalChange]
  );

  // Set up file watcher
  useFileWatcher({
    onPlanChange: handleExternalPlanChange,
    onLayoutChange: handleExternalLayoutChange,
    enabled: isCanvasView && !!planPath,
  });

  const handleOpenPlan = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });

      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        const result = parsePlan(content);

        if (result.success) {
          const hash = hashString(content);
          await mergeLayout(result.doc, selected, hash, result.title);
          // Start watching for external file changes
          await startWatching(selected);
          setIsCanvasView(true);
        } else {
          console.error('Parse errors:', result.errors);
          alert(`Failed to parse plan:\n${result.errors.join('\n')}`);
        }
      }
    } catch (err) {
      console.error('Failed to open plan:', err);
    }
  }, [mergeLayout]);

  const handleDemoMode = useCallback(() => {
    setPlan(SAMPLE_PLAN, '', 'demo');
    setLayouts(SAMPLE_LAYOUTS);
    setIsCanvasView(true);
  }, [setPlan, setLayouts]);

  const handleClose = useCallback(async () => {
    await stopWatching();
    clearPlan();
    setIsCanvasView(false);
  }, [clearPlan]);

  const handleLayoutChange = useCallback(
    (newLayouts: LayoutMap) => {
      updateLayoutsAndSave(newLayouts);
    },
    [updateLayoutsAndSave]
  );

  const handleStatusChange = useCallback(
    (nodeId: string, status: Status) => {
      updateNodeStatus(nodeId, status);
    },
    [updateNodeStatus]
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (confirm('Are you sure you want to delete this item?')) {
        deleteNode(nodeId);
      }
    },
    [deleteNode]
  );

  const handleAddTask = useCallback(
    (phaseId: string) => {
      const content = prompt('Enter task description:');
      if (content) {
        addTask(phaseId, content);
      }
    },
    [addTask]
  );

  // Handle conflict banner actions
  const handleReloadFromBanner = useCallback(() => {
    if (externalChangeType === 'plan') {
      reloadPlan();
    } else {
      reloadLayout();
    }
  }, [externalChangeType, reloadPlan, reloadLayout]);

  // Get selected node info for QuickActions
  const selectedNode = plan?.nodes.find((n) => n.id === selectedNodeId);

  if (!isCanvasView) {
    return (
      <main className="h-screen bg-gradient-to-br from-[#f7f8fb] via-[#eef1f8] to-[#e6ebf5]">
        <WelcomeScreen onOpenPlan={handleOpenPlan} onDemoMode={handleDemoMode} />
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-background">
      <CanvasHeader
        planPath={planPath}
        onClose={handleClose}
        isDirty={isDirty}
        isSaving={isSaving}
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 relative">
          {hasExternalChanges && externalChangeType && (
            <ConflictBanner
              changeType={externalChangeType}
              onReload={handleReloadFromBanner}
              onDismiss={dismissExternalChanges}
            />
          )}
          <PlanCanvas
            plan={plan}
            layouts={layouts}
            onLayoutChange={handleLayoutChange}
            onNodeSelect={setSelectedNode}
          />
          <QuickActions
            selectedNodeId={selectedNodeId}
            nodeType={selectedNode?.type ?? null}
            currentStatus={selectedNode?.status ?? null}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onAddTask={handleAddTask}
          />
        </div>
        {/* Chat panel */}
        {isChatOpen && (
          <ChatPanel className="w-96 flex-shrink-0" />
        )}
      </div>
    </main>
  );
}
