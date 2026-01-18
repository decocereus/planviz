/**
 * PlanCanvas - TLDraw-based canvas for plan visualization
 *
 * Renders plan phases and tasks as shapes with dependency arrows.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  Tldraw,
  Editor,
  TLShapeId,
  TLEventInfo,
  createShapeId,
  TLRecord,
} from 'tldraw';
import 'tldraw/tldraw.css';

import type { PlanDoc, LayoutMap, NodeLayout } from '../types';
import { planToShapes, shapeToLayout, isPlanNodeShape, fromShapeId, toShapeId } from './shapes';

export interface PlanCanvasProps {
  /** The plan document to render */
  plan: PlanDoc | null;
  /** Layout positions for nodes */
  layouts: LayoutMap;
  /** Callback when layouts change (drag/resize) */
  onLayoutChange?: (layouts: LayoutMap) => void;
  /** Callback when a node is selected */
  onNodeSelect?: (nodeId: string | null) => void;
  /** Whether the canvas is read-only */
  readOnly?: boolean;
}

export function PlanCanvas({
  plan,
  layouts,
  onLayoutChange,
  onNodeSelect,
  readOnly = false,
}: PlanCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const isUpdatingRef = useRef(false);

  // Sync plan to canvas when plan or layouts change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !plan) return;

    isUpdatingRef.current = true;

    try {
      // Get all current shape IDs
      const currentShapeIds = new Set(
        editor.getCurrentPageShapeIds()
      );

      // Generate shapes from plan
      const shapes = planToShapes(plan.nodes, plan.edges, layouts);

      // Create shapes that don't exist yet
      const shapesToCreate: TLRecord[] = [];
      const shapesToUpdate: { id: TLShapeId; changes: Partial<TLRecord> }[] = [];
      const newShapeIds = new Set<string>();

      for (const shape of shapes) {
        if (!shape.id) continue;
        newShapeIds.add(shape.id);

        if (currentShapeIds.has(shape.id as TLShapeId)) {
          // Update existing shape
          shapesToUpdate.push({
            id: shape.id as TLShapeId,
            changes: shape as Partial<TLRecord>,
          });
        } else {
          // Create new shape
          shapesToCreate.push(shape as TLRecord);
        }
      }

      // Delete shapes that are no longer in the plan
      const shapesToDelete: TLShapeId[] = [];
      for (const shapeId of currentShapeIds) {
        if (!newShapeIds.has(shapeId)) {
          shapesToDelete.push(shapeId);
        }
      }

      // Batch all operations
      editor.batch(() => {
        if (shapesToDelete.length > 0) {
          editor.deleteShapes(shapesToDelete);
        }
        if (shapesToCreate.length > 0) {
          editor.createShapes(shapesToCreate);
        }
        for (const { id, changes } of shapesToUpdate) {
          editor.updateShape({ id, ...changes });
        }
      });
    } finally {
      isUpdatingRef.current = false;
    }
  }, [plan, layouts]);

  // Handle editor mount
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Listen for shape changes to update layouts
    const handleChange = () => {
      if (isUpdatingRef.current) return;

      const updatedLayouts: LayoutMap = {};
      let hasChanges = false;

      for (const shape of editor.getCurrentPageShapes()) {
        if (isPlanNodeShape(shape) && shape.type === 'geo') {
          const nodeId = fromShapeId(shape.id);
          const layout = shapeToLayout(shape as any);

          // Check if layout actually changed
          const prevLayout = layouts[nodeId];
          if (
            !prevLayout ||
            prevLayout.x !== layout.x ||
            prevLayout.y !== layout.y ||
            prevLayout.width !== layout.width ||
            prevLayout.height !== layout.height
          ) {
            hasChanges = true;
          }
          updatedLayouts[nodeId] = layout;
        }
      }

      if (hasChanges && onLayoutChange) {
        onLayoutChange(updatedLayouts);
      }
    };

    // Subscribe to store changes
    const unsubscribe = editor.store.listen(handleChange, {
      source: 'user',
      scope: 'document',
    });

    // Listen for selection changes
    editor.on('change', (change) => {
      if (!onNodeSelect) return;

      const selectedIds = editor.getSelectedShapeIds();
      if (selectedIds.length === 1) {
        const shape = editor.getShape(selectedIds[0]);
        if (shape && isPlanNodeShape(shape)) {
          onNodeSelect(fromShapeId(shape.id));
        } else {
          onNodeSelect(null);
        }
      } else {
        onNodeSelect(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [layouts, onLayoutChange, onNodeSelect]);

  return (
    <div className="w-full h-full">
      <Tldraw
        onMount={handleMount}
        hideUi={readOnly}
        inferDarkMode={false}
      />
    </div>
  );
}

export default PlanCanvas;
