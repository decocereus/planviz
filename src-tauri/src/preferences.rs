//! User preferences persistence
//!
//! Stores and retrieves user preferences like:
//! - Last opened plan file
//! - Last-used agent per plan
//! - Recent plans list

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Maximum number of recent plans to keep
const MAX_RECENT_PLANS: usize = 10;

/// Preferences file name
const PREFERENCES_FILE: &str = "preferences.json";

/// Per-plan preferences
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PlanPreferences {
    /// Last-used agent for this plan
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_agent: Option<String>,
    /// Last opened timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened: Option<i64>,
}

/// Global user preferences
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    /// Last opened plan path
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_plan_path: Option<String>,
    /// Recent plans list (most recent first)
    #[serde(default)]
    pub recent_plans: Vec<String>,
    /// Per-plan preferences (keyed by plan path)
    #[serde(default)]
    pub plan_preferences: HashMap<String, PlanPreferences>,
    /// Default agent to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_agent: Option<String>,
}

/// Get the preferences file path
fn get_preferences_path() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join("plan-visualizer").join(PREFERENCES_FILE))
}

/// Read preferences from disk
fn read_preferences() -> UserPreferences {
    let path = match get_preferences_path() {
        Some(p) => p,
        None => return UserPreferences::default(),
    };

    if !path.exists() {
        return UserPreferences::default();
    }

    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => UserPreferences::default(),
    }
}

/// Write preferences to disk
fn write_preferences(prefs: &UserPreferences) -> Result<(), String> {
    let path = get_preferences_path().ok_or("Could not determine config directory")?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let content =
        serde_json::to_string_pretty(prefs).map_err(|e| format!("Failed to serialize: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write preferences: {}", e))?;

    Ok(())
}

/// Get all user preferences
#[tauri::command]
pub fn get_preferences() -> UserPreferences {
    read_preferences()
}

/// Set the last opened plan
#[tauri::command]
pub fn set_last_plan(plan_path: String) -> Result<(), String> {
    let mut prefs = read_preferences();

    prefs.last_plan_path = Some(plan_path.clone());

    // Update recent plans list
    prefs.recent_plans.retain(|p| p != &plan_path);
    prefs.recent_plans.insert(0, plan_path.clone());
    prefs.recent_plans.truncate(MAX_RECENT_PLANS);

    // Update plan preferences with timestamp
    let plan_prefs = prefs.plan_preferences.entry(plan_path).or_default();
    plan_prefs.last_opened = Some(chrono::Utc::now().timestamp());

    write_preferences(&prefs)
}

/// Set the last-used agent for a plan
#[tauri::command]
pub fn set_plan_agent(plan_path: String, agent: String) -> Result<(), String> {
    let mut prefs = read_preferences();

    let plan_prefs = prefs.plan_preferences.entry(plan_path).or_default();
    plan_prefs.last_agent = Some(agent);

    write_preferences(&prefs)
}

/// Get the last-used agent for a plan
#[tauri::command]
pub fn get_plan_agent(plan_path: String) -> Option<String> {
    let prefs = read_preferences();
    prefs
        .plan_preferences
        .get(&plan_path)
        .and_then(|p| p.last_agent.clone())
}

/// Set the default agent
#[tauri::command]
pub fn set_default_agent(agent: String) -> Result<(), String> {
    let mut prefs = read_preferences();
    prefs.default_agent = Some(agent);
    write_preferences(&prefs)
}

/// Get recent plans list
#[tauri::command]
pub fn get_recent_plans() -> Vec<String> {
    read_preferences().recent_plans
}

/// Remove a plan from recent list (e.g., if file no longer exists)
#[tauri::command]
pub fn remove_recent_plan(plan_path: String) -> Result<(), String> {
    let mut prefs = read_preferences();
    prefs.recent_plans.retain(|p| p != &plan_path);

    // Clear last plan if it was removed
    if prefs.last_plan_path.as_ref() == Some(&plan_path) {
        prefs.last_plan_path = prefs.recent_plans.first().cloned();
    }

    write_preferences(&prefs)
}

/// Clear all preferences
#[tauri::command]
pub fn clear_preferences() -> Result<(), String> {
    write_preferences(&UserPreferences::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_preferences_serialization() {
        let mut prefs = UserPreferences::default();
        prefs.last_plan_path = Some("/path/to/plan.md".to_string());
        prefs.recent_plans = vec!["/path/to/plan.md".to_string()];

        let json = serde_json::to_string(&prefs).unwrap();
        assert!(json.contains("lastPlanPath"));
        assert!(json.contains("recentPlans"));
    }

    #[test]
    fn test_plan_preferences_serialization() {
        let prefs = PlanPreferences {
            last_agent: Some("claude_code".to_string()),
            last_opened: Some(1234567890),
        };

        let json = serde_json::to_string(&prefs).unwrap();
        assert!(json.contains("lastAgent"));
        assert!(json.contains("lastOpened"));
    }
}
