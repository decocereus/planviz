//! File watcher module for monitoring plan.md and layout.json changes
//!
//! Uses notify crate with debouncing to emit Tauri events when files change.

use notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Debounce duration for file change events (ms)
const DEBOUNCE_MS: u64 = 500;

/// Event payload for file change notifications
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    /// The path of the changed file
    pub path: String,
    /// The type of file: "plan" or "layout"
    pub file_type: String,
}

/// Global state for the file watcher
#[derive(Default)]
pub struct WatcherState {
    debouncer: Option<Debouncer<RecommendedWatcher>>,
    watched_plan: Option<String>,
}

/// Get the layout file path for a given plan path
fn get_layout_path(plan_path: &str) -> String {
    format!("{}.layout.json", plan_path)
}

/// Start watching a plan file and its associated layout file
#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    plan_path: String,
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;

    // Stop existing watcher if any
    if watcher_state.debouncer.is_some() {
        watcher_state.debouncer = None;
        watcher_state.watched_plan = None;
    }

    let plan_path_clone = plan_path.clone();
    let layout_path = get_layout_path(&plan_path);

    // Create debouncer with event handler
    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            match res {
                Ok(events) => {
                    for event in events {
                        if event.kind != DebouncedEventKind::Any {
                            continue;
                        }

                        let path_str = event.path.to_string_lossy().to_string();

                        // Determine file type
                        let file_type = if path_str.ends_with(".layout.json") {
                            "layout"
                        } else if path_str.ends_with(".md") {
                            "plan"
                        } else {
                            continue;
                        };

                        let payload = FileChangeEvent {
                            path: path_str,
                            file_type: file_type.to_string(),
                        };

                        // Emit event to frontend
                        if let Err(e) = app_handle.emit("file-changed", payload) {
                            eprintln!("Failed to emit file-changed event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("File watch error: {:?}", e);
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create debouncer: {}", e))?;

    // Watch the plan file
    let plan_path_buf = PathBuf::from(&plan_path);
    if plan_path_buf.exists() {
        debouncer
            .watcher()
            .watch(&plan_path_buf, notify::RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch plan file: {}", e))?;
    }

    // Watch the layout file if it exists
    let layout_path_buf = PathBuf::from(&layout_path);
    if layout_path_buf.exists() {
        debouncer
            .watcher()
            .watch(&layout_path_buf, notify::RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch layout file: {}", e))?;
    }

    watcher_state.debouncer = Some(debouncer);
    watcher_state.watched_plan = Some(plan_path_clone);

    Ok(())
}

/// Stop watching files
#[tauri::command]
pub fn stop_watching(state: tauri::State<'_, Mutex<WatcherState>>) -> Result<(), String> {
    let mut watcher_state = state.lock().map_err(|e| e.to_string())?;

    watcher_state.debouncer = None;
    watcher_state.watched_plan = None;

    Ok(())
}

/// Get the currently watched plan path
#[tauri::command]
pub fn get_watched_plan(state: tauri::State<'_, Mutex<WatcherState>>) -> Result<Option<String>, String> {
    let watcher_state = state.lock().map_err(|e| e.to_string())?;
    Ok(watcher_state.watched_plan.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_layout_path() {
        assert_eq!(
            get_layout_path("/path/to/plan.md"),
            "/path/to/plan.md.layout.json"
        );
    }

    #[test]
    fn test_file_change_event_serialization() {
        let event = FileChangeEvent {
            path: "/path/to/plan.md".to_string(),
            file_type: "plan".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("fileType")); // camelCase
        assert!(json.contains("plan"));
    }

    #[test]
    fn test_watcher_state_default() {
        let state = WatcherState::default();
        assert!(state.debouncer.is_none());
        assert!(state.watched_plan.is_none());
    }
}
