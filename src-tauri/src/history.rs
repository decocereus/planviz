use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::layout::LayoutFile;

/// Maximum number of snapshots to retain per plan
const MAX_SNAPSHOTS: usize = 5;

/// Minimum interval between time-based snapshots (in seconds)
const MIN_SNAPSHOT_INTERVAL_SECS: u64 = 300; // 5 minutes

/// Get the history directory path for a given plan path
/// Creates .plan-history/ in the same directory as the plan file
pub fn get_history_dir(plan_path: &str) -> PathBuf {
    let plan = Path::new(plan_path);
    let parent = plan.parent().unwrap_or(Path::new("."));
    parent.join(".plan-history")
}

/// Get the snapshot filename prefix for a plan
/// Uses the plan filename as prefix to distinguish snapshots per plan
fn get_snapshot_prefix(plan_path: &str) -> String {
    let plan = Path::new(plan_path);
    let filename = plan.file_name().unwrap_or_default().to_string_lossy();
    format!("{}.layout", filename)
}

/// Generate a timestamped snapshot filename
fn generate_snapshot_filename(plan_path: &str) -> String {
    let prefix = get_snapshot_prefix(plan_path);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}.{}.json", prefix, timestamp)
}

/// List all snapshots for a given plan, sorted by timestamp (oldest first)
pub fn list_snapshots(plan_path: &str) -> Result<Vec<PathBuf>, String> {
    let history_dir = get_history_dir(plan_path);
    let prefix = get_snapshot_prefix(plan_path);

    if !history_dir.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots: Vec<PathBuf> = fs::read_dir(&history_dir)
        .map_err(|e| format!("Failed to read history directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|name| name.starts_with(&prefix) && name.ends_with(".json"))
        })
        .collect();

    // Sort by filename (which includes timestamp) - oldest first
    snapshots.sort();
    Ok(snapshots)
}

/// Get the timestamp from the most recent snapshot (if any)
fn get_latest_snapshot_time(plan_path: &str) -> Option<u64> {
    let snapshots = list_snapshots(plan_path).ok()?;
    let latest = snapshots.last()?;
    let filename = latest.file_name()?.to_str()?;

    // Extract timestamp from filename: prefix.TIMESTAMP.json
    let parts: Vec<&str> = filename.rsplitn(3, '.').collect();
    if parts.len() >= 3 {
        parts[1].parse().ok()
    } else {
        None
    }
}

/// Check if enough time has passed since the last snapshot
pub fn should_create_snapshot(plan_path: &str) -> bool {
    let Some(last_timestamp_ms) = get_latest_snapshot_time(plan_path) else {
        return true; // No previous snapshot, create one
    };

    let current_time_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let elapsed_secs = (current_time_ms.saturating_sub(last_timestamp_ms)) / 1000;
    elapsed_secs >= MIN_SNAPSHOT_INTERVAL_SECS
}

/// Create a snapshot of the current layout before writing
/// Only creates if time-based cadence allows or force is true
pub fn create_snapshot(plan_path: &str, layout: &LayoutFile, force: bool) -> Result<(), String> {
    // Check time-based cadence unless forced
    if !force && !should_create_snapshot(plan_path) {
        return Ok(());
    }

    let history_dir = get_history_dir(plan_path);

    // Create history directory if needed
    if !history_dir.exists() {
        fs::create_dir_all(&history_dir)
            .map_err(|e| format!("Failed to create history directory: {}", e))?;
    }

    // Generate snapshot filename and write
    let snapshot_filename = generate_snapshot_filename(plan_path);
    let snapshot_path = history_dir.join(&snapshot_filename);

    let content = serde_json::to_string_pretty(layout)
        .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;

    fs::write(&snapshot_path, content)
        .map_err(|e| format!("Failed to write snapshot: {}", e))?;

    // Rotate old snapshots
    rotate_snapshots(plan_path)?;

    Ok(())
}

/// Remove old snapshots, keeping only the most recent MAX_SNAPSHOTS
pub fn rotate_snapshots(plan_path: &str) -> Result<(), String> {
    let snapshots = list_snapshots(plan_path)?;

    if snapshots.len() <= MAX_SNAPSHOTS {
        return Ok(());
    }

    // Remove oldest snapshots (list is sorted oldest first)
    let to_remove = snapshots.len() - MAX_SNAPSHOTS;
    for snapshot in snapshots.iter().take(to_remove) {
        fs::remove_file(snapshot)
            .map_err(|e| format!("Failed to remove old snapshot {:?}: {}", snapshot, e))?;
    }

    Ok(())
}

/// Get the most recent snapshot for a plan (useful for undo)
#[tauri::command]
pub fn get_latest_snapshot(plan_path: String) -> Result<Option<LayoutFile>, String> {
    let snapshots = list_snapshots(&plan_path)?;

    let Some(latest) = snapshots.last() else {
        return Ok(None);
    };

    let content = fs::read_to_string(latest)
        .map_err(|e| format!("Failed to read snapshot: {}", e))?;

    let layout: LayoutFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse snapshot: {}", e))?;

    Ok(Some(layout))
}

/// List all snapshot timestamps for a plan
#[tauri::command]
pub fn list_snapshot_timestamps(plan_path: String) -> Result<Vec<u64>, String> {
    let snapshots = list_snapshots(&plan_path)?;

    let timestamps: Vec<u64> = snapshots
        .iter()
        .filter_map(|path| {
            let filename = path.file_name()?.to_str()?;
            let parts: Vec<&str> = filename.rsplitn(3, '.').collect();
            if parts.len() >= 3 {
                parts[1].parse().ok()
            } else {
                None
            }
        })
        .collect();

    Ok(timestamps)
}

/// Clear all snapshots for a plan
#[tauri::command]
pub fn clear_snapshots(plan_path: String) -> Result<(), String> {
    let snapshots = list_snapshots(&plan_path)?;

    for snapshot in snapshots {
        fs::remove_file(&snapshot)
            .map_err(|e| format!("Failed to remove snapshot {:?}: {}", snapshot, e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    fn create_test_layout(hash: &str) -> LayoutFile {
        LayoutFile {
            version: 1,
            plan_hash: hash.to_string(),
            layouts: HashMap::new(),
            last_modified: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_get_history_dir() {
        let dir = get_history_dir("/path/to/plan.md");
        assert_eq!(dir, PathBuf::from("/path/to/.plan-history"));

        // For relative paths, parent of "plan.md" is "." which joins with ".plan-history"
        let dir = get_history_dir("plan.md");
        assert_eq!(dir, PathBuf::from(".plan-history"));
    }

    #[test]
    fn test_get_snapshot_prefix() {
        let prefix = get_snapshot_prefix("/path/to/plan.md");
        assert_eq!(prefix, "plan.md.layout");
    }

    #[test]
    fn test_create_and_list_snapshots() {
        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let plan_path_str = plan_path.to_string_lossy().to_string();

        // Create a snapshot
        let layout = create_test_layout("hash1");
        create_snapshot(&plan_path_str, &layout, true).unwrap();

        // List snapshots
        let snapshots = list_snapshots(&plan_path_str).unwrap();
        assert_eq!(snapshots.len(), 1);

        // Verify history directory was created
        let history_dir = get_history_dir(&plan_path_str);
        assert!(history_dir.exists());
    }

    #[test]
    fn test_snapshot_rotation() {
        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let plan_path_str = plan_path.to_string_lossy().to_string();
        let history_dir = get_history_dir(&plan_path_str);
        fs::create_dir_all(&history_dir).unwrap();

        // Create 7 snapshots manually with different timestamps
        for i in 0..7 {
            let filename = format!("plan.md.layout.{}.json", 1000000000000u64 + i);
            let path = history_dir.join(&filename);
            let layout = create_test_layout(&format!("hash{}", i));
            let content = serde_json::to_string(&layout).unwrap();
            fs::write(&path, content).unwrap();
        }

        // Verify 7 snapshots exist
        let snapshots = list_snapshots(&plan_path_str).unwrap();
        assert_eq!(snapshots.len(), 7);

        // Rotate
        rotate_snapshots(&plan_path_str).unwrap();

        // Should now have 5 snapshots
        let snapshots = list_snapshots(&plan_path_str).unwrap();
        assert_eq!(snapshots.len(), 5);

        // Oldest should have been removed (timestamps 1000000000000 and 1000000000001)
        let remaining: Vec<String> = snapshots
            .iter()
            .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(String::from))
            .collect();

        assert!(!remaining.iter().any(|n| n.contains("1000000000000.")));
        assert!(!remaining.iter().any(|n| n.contains("1000000000001.")));
        assert!(remaining.iter().any(|n| n.contains("1000000000006.")));
    }

    #[test]
    fn test_get_latest_snapshot() {
        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let plan_path_str = plan_path.to_string_lossy().to_string();

        // No snapshots
        let result = get_latest_snapshot(plan_path_str.clone()).unwrap();
        assert!(result.is_none());

        // Create a snapshot
        let layout = create_test_layout("latest_hash");
        create_snapshot(&plan_path_str, &layout, true).unwrap();

        // Get latest
        let result = get_latest_snapshot(plan_path_str).unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().plan_hash, "latest_hash");
    }

    #[test]
    fn test_clear_snapshots() {
        let temp = tempdir().unwrap();
        let plan_path = temp.path().join("plan.md");
        let plan_path_str = plan_path.to_string_lossy().to_string();

        // Create snapshots
        let layout = create_test_layout("hash1");
        create_snapshot(&plan_path_str, &layout, true).unwrap();

        // Verify exists
        let snapshots = list_snapshots(&plan_path_str).unwrap();
        assert!(!snapshots.is_empty());

        // Clear
        clear_snapshots(plan_path_str.clone()).unwrap();

        // Verify cleared
        let snapshots = list_snapshots(&plan_path_str).unwrap();
        assert!(snapshots.is_empty());
    }
}
