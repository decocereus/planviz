use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use crate::history;

/// Default dimensions for auto-placed nodes
const DEFAULT_NODE_WIDTH: f64 = 280.0;
const DEFAULT_NODE_HEIGHT: f64 = 80.0;
const DEFAULT_PHASE_HEIGHT: f64 = 50.0;
const GRID_SPACING_X: f64 = 320.0;
const GRID_SPACING_Y: f64 = 100.0;
const GRID_COLUMNS: usize = 3;
const GRID_START_X: f64 = 50.0;
const GRID_START_Y: f64 = 50.0;

/// Position and size for a node on the canvas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeLayout {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Map of node IDs to their layout positions
pub type LayoutMap = HashMap<String, NodeLayout>;

/// Complete layout file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutFile {
    pub version: u32,
    pub plan_hash: String,
    pub layouts: LayoutMap,
    pub last_modified: String,
}

/// Node info from parsed plan (for merge operations)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub id: String,
    pub node_type: String, // "phase" or "task"
    pub phase_id: Option<String>, // Parent phase ID for tasks
}

/// Result of merging layout with plan
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub layout: LayoutFile,
    pub added_nodes: Vec<String>,
    pub removed_nodes: Vec<String>,
}

impl Default for LayoutFile {
    fn default() -> Self {
        Self {
            version: 1,
            plan_hash: String::new(),
            layouts: HashMap::new(),
            last_modified: String::new(),
        }
    }
}

/// Get the layout file path for a given plan path
fn get_layout_path(plan_path: &str) -> String {
    format!("{}.layout.json", plan_path)
}

/// Read layout from {plan_path}.layout.json
/// Returns default empty LayoutFile if file doesn't exist
#[tauri::command]
pub fn read_layout(plan_path: String) -> Result<LayoutFile, String> {
    let layout_path = get_layout_path(&plan_path);
    let path = Path::new(&layout_path);

    if !path.exists() {
        return Ok(LayoutFile::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read layout file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse layout file: {}", e))
}

/// Write layout to {plan_path}.layout.json
/// Creates a snapshot of the existing layout before writing (for undo capability)
/// Creates parent directories if needed
#[tauri::command]
pub fn write_layout(plan_path: String, layout: LayoutFile) -> Result<(), String> {
    let layout_path = get_layout_path(&plan_path);
    let path = Path::new(&layout_path);

    // Create snapshot of existing layout before overwriting (if exists)
    // Uses time-based cadence to avoid excessive snapshots
    if path.exists() {
        if let Ok(existing) = read_layout(plan_path.clone()) {
            // Only snapshot non-empty layouts
            if !existing.layouts.is_empty() {
                // Force snapshot on first write after a while, respect cadence otherwise
                let _ = history::create_snapshot(&plan_path, &existing, false);
            }
        }
    }

    // Create parent directories if needed
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    let content = serde_json::to_string_pretty(&layout)
        .map_err(|e| format!("Failed to serialize layout: {}", e))?;

    fs::write(path, content)
        .map_err(|e| format!("Failed to write layout file: {}", e))
}

/// Calculate grid position for a new node
/// Uses hierarchical layout: phases in a column, tasks in grid under each phase
fn calculate_auto_position(
    node: &NodeInfo,
    existing_layouts: &LayoutMap,
    nodes: &[NodeInfo],
) -> NodeLayout {
    let node_type = node.node_type.as_str();

    match node_type {
        "phase" => {
            // Phases are positioned in a vertical column on the left
            // Find the bottom-most phase position
            let phase_count = nodes
                .iter()
                .filter(|n| n.node_type == "phase" && existing_layouts.contains_key(&n.id))
                .count();

            let y = GRID_START_Y + (phase_count as f64 * (DEFAULT_PHASE_HEIGHT + GRID_SPACING_Y * 3.0));

            NodeLayout {
                x: GRID_START_X,
                y,
                width: DEFAULT_NODE_WIDTH,
                height: DEFAULT_PHASE_HEIGHT,
            }
        }
        "task" => {
            // Tasks are positioned in a grid, grouped by phase
            let phase_id = node.phase_id.as_deref().unwrap_or("");

            // Find the phase's y-position (or calculate based on phase index)
            let phase_y = if let Some(phase_layout) = existing_layouts.get(phase_id) {
                phase_layout.y
            } else {
                // Calculate based on phase index
                let phase_index = nodes
                    .iter()
                    .filter(|n| n.node_type == "phase")
                    .position(|n| n.id == phase_id)
                    .unwrap_or(0);
                GRID_START_Y + (phase_index as f64 * (DEFAULT_PHASE_HEIGHT + GRID_SPACING_Y * 3.0))
            };

            // Count tasks already positioned in this phase
            let tasks_in_phase: Vec<&NodeInfo> = nodes
                .iter()
                .filter(|n| {
                    n.node_type == "task"
                        && n.phase_id.as_deref() == Some(phase_id)
                        && existing_layouts.contains_key(&n.id)
                })
                .collect();

            let task_index = tasks_in_phase.len();
            let row = task_index / GRID_COLUMNS;
            let col = task_index % GRID_COLUMNS;

            NodeLayout {
                x: GRID_START_X + (col as f64 * GRID_SPACING_X),
                y: phase_y + DEFAULT_PHASE_HEIGHT + GRID_SPACING_Y + (row as f64 * GRID_SPACING_Y),
                width: DEFAULT_NODE_WIDTH,
                height: DEFAULT_NODE_HEIGHT,
            }
        }
        _ => {
            // Fallback: simple grid position
            let count = existing_layouts.len();
            let row = count / GRID_COLUMNS;
            let col = count % GRID_COLUMNS;

            NodeLayout {
                x: GRID_START_X + (col as f64 * GRID_SPACING_X),
                y: GRID_START_Y + (row as f64 * GRID_SPACING_Y),
                width: DEFAULT_NODE_WIDTH,
                height: DEFAULT_NODE_HEIGHT,
            }
        }
    }
}

/// Merge layout with parsed plan nodes
/// - Adds auto-positioned entries for new nodes
/// - Removes entries for nodes that no longer exist
/// - Preserves existing positions for unchanged nodes
#[tauri::command]
pub fn merge_layout(
    plan_path: String,
    nodes: Vec<NodeInfo>,
    plan_hash: String,
) -> Result<MergeResult, String> {
    let mut layout = read_layout(plan_path)?;
    let mut added_nodes: Vec<String> = Vec::new();
    let mut removed_nodes: Vec<String> = Vec::new();

    // Build set of valid node IDs from parsed plan
    let valid_ids: HashSet<String> = nodes.iter().map(|n| n.id.clone()).collect();

    // Remove orphans (layout entries for nodes that no longer exist)
    let orphan_ids: Vec<String> = layout
        .layouts
        .keys()
        .filter(|id| !valid_ids.contains(*id))
        .cloned()
        .collect();

    for id in orphan_ids {
        layout.layouts.remove(&id);
        removed_nodes.push(id);
    }

    // Process nodes in order: phases first, then tasks (so phases have positions for task calculations)
    let phases: Vec<&NodeInfo> = nodes.iter().filter(|n| n.node_type == "phase").collect();
    let tasks: Vec<&NodeInfo> = nodes.iter().filter(|n| n.node_type == "task").collect();

    // Add positions for new phases
    for node in &phases {
        if !layout.layouts.contains_key(&node.id) {
            let position = calculate_auto_position(node, &layout.layouts, &nodes);
            layout.layouts.insert(node.id.clone(), position);
            added_nodes.push(node.id.clone());
        }
    }

    // Add positions for new tasks
    for node in &tasks {
        if !layout.layouts.contains_key(&node.id) {
            let position = calculate_auto_position(node, &layout.layouts, &nodes);
            layout.layouts.insert(node.id.clone(), position);
            added_nodes.push(node.id.clone());
        }
    }

    // Update metadata
    layout.plan_hash = plan_hash;
    layout.last_modified = chrono::Utc::now().to_rfc3339();

    Ok(MergeResult {
        layout,
        added_nodes,
        removed_nodes,
    })
}

/// Generate a fresh layout for all nodes (used when no layout exists or cache miss)
#[tauri::command]
pub fn generate_layout(nodes: Vec<NodeInfo>, plan_hash: String) -> Result<LayoutFile, String> {
    let mut layout = LayoutFile::default();

    // Process nodes in order: phases first, then tasks
    let phases: Vec<&NodeInfo> = nodes.iter().filter(|n| n.node_type == "phase").collect();
    let tasks: Vec<&NodeInfo> = nodes.iter().filter(|n| n.node_type == "task").collect();

    // Add positions for phases
    for node in &phases {
        let position = calculate_auto_position(node, &layout.layouts, &nodes);
        layout.layouts.insert(node.id.clone(), position);
    }

    // Add positions for tasks
    for node in &tasks {
        let position = calculate_auto_position(node, &layout.layouts, &nodes);
        layout.layouts.insert(node.id.clone(), position);
    }

    // Set metadata
    layout.plan_hash = plan_hash;
    layout.last_modified = chrono::Utc::now().to_rfc3339();

    Ok(layout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_layout_file_default() {
        let layout = LayoutFile::default();
        assert_eq!(layout.version, 1);
        assert!(layout.plan_hash.is_empty());
        assert!(layout.layouts.is_empty());
    }

    #[test]
    fn test_get_layout_path() {
        assert_eq!(get_layout_path("/path/to/plan.md"), "/path/to/plan.md.layout.json");
    }

    #[test]
    fn test_node_layout_serialization() {
        let layout = NodeLayout {
            x: 100.0,
            y: 200.0,
            width: 300.0,
            height: 150.0,
        };
        let json = serde_json::to_string(&layout).unwrap();
        assert!(json.contains("100"));
        assert!(json.contains("200"));
    }

    #[test]
    fn test_layout_file_serialization() {
        let mut layouts = HashMap::new();
        layouts.insert("node1".to_string(), NodeLayout {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 50.0,
        });

        let layout_file = LayoutFile {
            version: 1,
            plan_hash: "abc123".to_string(),
            layouts,
            last_modified: "2024-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string_pretty(&layout_file).unwrap();
        let parsed: LayoutFile = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.plan_hash, "abc123");
        assert!(parsed.layouts.contains_key("node1"));
    }

    fn create_node(id: &str, node_type: &str, phase_id: Option<&str>) -> NodeInfo {
        NodeInfo {
            id: id.to_string(),
            node_type: node_type.to_string(),
            phase_id: phase_id.map(|s| s.to_string()),
        }
    }

    #[test]
    fn test_generate_layout_empty() {
        let nodes: Vec<NodeInfo> = vec![];
        let result = generate_layout(nodes, "hash123".to_string()).unwrap();

        assert!(result.layouts.is_empty());
        assert_eq!(result.plan_hash, "hash123");
    }

    #[test]
    fn test_generate_layout_single_phase() {
        let nodes = vec![create_node("phase_0", "phase", None)];
        let result = generate_layout(nodes, "hash123".to_string()).unwrap();

        assert_eq!(result.layouts.len(), 1);
        assert!(result.layouts.contains_key("phase_0"));

        let phase_layout = result.layouts.get("phase_0").unwrap();
        assert_eq!(phase_layout.x, GRID_START_X);
        assert_eq!(phase_layout.y, GRID_START_Y);
        assert_eq!(phase_layout.height, DEFAULT_PHASE_HEIGHT);
    }

    #[test]
    fn test_generate_layout_phase_with_tasks() {
        let nodes = vec![
            create_node("phase_0", "phase", None),
            create_node("t1", "task", Some("phase_0")),
            create_node("t2", "task", Some("phase_0")),
        ];
        let result = generate_layout(nodes, "hash".to_string()).unwrap();

        assert_eq!(result.layouts.len(), 3);

        // First task should be at column 0
        let t1 = result.layouts.get("t1").unwrap();
        assert_eq!(t1.x, GRID_START_X);

        // Second task should be at column 1
        let t2 = result.layouts.get("t2").unwrap();
        assert_eq!(t2.x, GRID_START_X + GRID_SPACING_X);
    }

    #[test]
    fn test_generate_layout_multiple_phases() {
        let nodes = vec![
            create_node("phase_0", "phase", None),
            create_node("phase_1", "phase", None),
            create_node("t1", "task", Some("phase_0")),
            create_node("t2", "task", Some("phase_1")),
        ];
        let result = generate_layout(nodes, "hash".to_string()).unwrap();

        assert_eq!(result.layouts.len(), 4);

        let phase_0 = result.layouts.get("phase_0").unwrap();
        let phase_1 = result.layouts.get("phase_1").unwrap();

        // Phase 1 should be below phase 0
        assert!(phase_1.y > phase_0.y);
    }

    #[test]
    fn test_auto_position_grid_columns() {
        // Test that tasks wrap to new rows after GRID_COLUMNS
        let nodes: Vec<NodeInfo> = (0..5)
            .map(|i| create_node(&format!("t{}", i), "task", Some("phase_0")))
            .chain(std::iter::once(create_node("phase_0", "phase", None)))
            .collect();

        let result = generate_layout(nodes, "hash".to_string()).unwrap();

        // First row: t0, t1, t2
        let t0 = result.layouts.get("t0").unwrap();
        let t2 = result.layouts.get("t2").unwrap();

        // Second row: t3, t4
        let t3 = result.layouts.get("t3").unwrap();

        // t3 should be on a new row (higher y)
        assert!(t3.y > t0.y);
        // t3 should be at column 0 (same x as t0)
        assert_eq!(t3.x, t0.x);
        // t2 should be at column 2
        assert_eq!(t2.x, t0.x + 2.0 * GRID_SPACING_X);
    }

    #[test]
    fn test_merge_layout_removes_orphans() {
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let layout_path = temp.path().join("plan.md.layout.json");

        // Create existing layout with extra node that doesn't exist in plan
        let mut existing = LayoutFile::default();
        existing.layouts.insert(
            "orphan_node".to_string(),
            NodeLayout { x: 0.0, y: 0.0, width: 100.0, height: 50.0 },
        );
        existing.layouts.insert(
            "t1".to_string(),
            NodeLayout { x: 50.0, y: 50.0, width: 100.0, height: 50.0 },
        );

        let content = serde_json::to_string(&existing).unwrap();
        fs::write(&layout_path, content).unwrap();

        // Merge with plan that only has t1
        let nodes = vec![create_node("t1", "task", Some("phase_0"))];
        let result = merge_layout(
            plan_path.to_string_lossy().to_string(),
            nodes,
            "new_hash".to_string(),
        )
        .unwrap();

        // Orphan should be removed
        assert!(!result.layout.layouts.contains_key("orphan_node"));
        assert!(result.removed_nodes.contains(&"orphan_node".to_string()));

        // t1 should be preserved with original position
        assert!(result.layout.layouts.contains_key("t1"));
        let t1 = result.layout.layouts.get("t1").unwrap();
        assert_eq!(t1.x, 50.0);
    }

    #[test]
    fn test_merge_layout_adds_new_nodes() {
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let layout_path = temp.path().join("plan.md.layout.json");

        // Create existing layout with one node
        let mut existing = LayoutFile::default();
        existing.layouts.insert(
            "t1".to_string(),
            NodeLayout { x: 50.0, y: 50.0, width: 100.0, height: 50.0 },
        );

        let content = serde_json::to_string(&existing).unwrap();
        fs::write(&layout_path, content).unwrap();

        // Merge with plan that has t1 and new t2
        let nodes = vec![
            create_node("phase_0", "phase", None),
            create_node("t1", "task", Some("phase_0")),
            create_node("t2", "task", Some("phase_0")),
        ];
        let result = merge_layout(
            plan_path.to_string_lossy().to_string(),
            nodes,
            "new_hash".to_string(),
        )
        .unwrap();

        // New nodes should be added
        assert!(result.layout.layouts.contains_key("phase_0"));
        assert!(result.layout.layouts.contains_key("t2"));
        assert!(result.added_nodes.contains(&"phase_0".to_string()));
        assert!(result.added_nodes.contains(&"t2".to_string()));

        // t1 should be preserved with original position
        let t1 = result.layout.layouts.get("t1").unwrap();
        assert_eq!(t1.x, 50.0);
    }

    #[test]
    fn test_merge_layout_preserves_positions() {
        use tempfile::tempdir;

        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let layout_path = temp.path().join("plan.md.layout.json");

        // Create existing layout with custom positions
        let mut existing = LayoutFile::default();
        existing.layouts.insert(
            "phase_0".to_string(),
            NodeLayout { x: 100.0, y: 200.0, width: 300.0, height: 60.0 },
        );
        existing.layouts.insert(
            "t1".to_string(),
            NodeLayout { x: 500.0, y: 600.0, width: 250.0, height: 80.0 },
        );

        let content = serde_json::to_string(&existing).unwrap();
        fs::write(&layout_path, content).unwrap();

        // Merge with same nodes
        let nodes = vec![
            create_node("phase_0", "phase", None),
            create_node("t1", "task", Some("phase_0")),
        ];
        let result = merge_layout(
            plan_path.to_string_lossy().to_string(),
            nodes,
            "new_hash".to_string(),
        )
        .unwrap();

        // Positions should be preserved exactly
        let phase = result.layout.layouts.get("phase_0").unwrap();
        assert_eq!(phase.x, 100.0);
        assert_eq!(phase.y, 200.0);

        let t1 = result.layout.layouts.get("t1").unwrap();
        assert_eq!(t1.x, 500.0);
        assert_eq!(t1.y, 600.0);

        // No nodes should be added or removed
        assert!(result.added_nodes.is_empty());
        assert!(result.removed_nodes.is_empty());
    }

    #[test]
    fn test_node_info_serialization() {
        let node = NodeInfo {
            id: "t1".to_string(),
            node_type: "task".to_string(),
            phase_id: Some("phase_0".to_string()),
        };

        let json = serde_json::to_string(&node).unwrap();
        assert!(json.contains("nodeType")); // camelCase
        assert!(json.contains("phaseId")); // camelCase

        let parsed: NodeInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "t1");
        assert_eq!(parsed.node_type, "task");
        assert_eq!(parsed.phase_id, Some("phase_0".to_string()));
    }

    #[test]
    fn test_merge_result_serialization() {
        let result = MergeResult {
            layout: LayoutFile::default(),
            added_nodes: vec!["t1".to_string()],
            removed_nodes: vec!["t2".to_string()],
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("addedNodes")); // camelCase
        assert!(json.contains("removedNodes")); // camelCase
    }
}
