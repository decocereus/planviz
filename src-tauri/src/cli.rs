//! CLI argument parsing and launch configuration
//!
//! Supports launching with:
//! - `--plan path/to/plan.md` - Open a specific plan file
//! - `--agent claude-code|codex|opencode` - Pre-select an agent
//! - `--cwd /path/to/dir` - Set working directory

use clap::Parser;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// CLI arguments for Plan Visualizer
#[derive(Parser, Debug, Clone)]
#[command(name = "plan-visualizer")]
#[command(about = "Visualize and interact with plan.md files")]
#[command(version)]
pub struct CliArgs {
    /// Path to a plan.md file to open
    #[arg(long, short = 'p')]
    pub plan: Option<PathBuf>,

    /// Agent to use (claude-code, codex, opencode)
    #[arg(long, short = 'a')]
    pub agent: Option<String>,

    /// Working directory for the agent
    #[arg(long, short = 'c')]
    pub cwd: Option<PathBuf>,
}

/// Launch configuration passed to the frontend
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfig {
    /// Plan file path (if specified via CLI)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_path: Option<String>,

    /// Pre-selected agent (if specified via CLI)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,

    /// Working directory
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,

    /// Whether launched from CLI with arguments
    pub from_cli: bool,
}

/// Global launch configuration state
pub struct LaunchConfigState {
    config: Mutex<LaunchConfig>,
}

impl LaunchConfigState {
    pub fn new(config: LaunchConfig) -> Self {
        Self {
            config: Mutex::new(config),
        }
    }

    pub fn get(&self) -> LaunchConfig {
        self.config.lock().unwrap().clone()
    }
}

impl Default for LaunchConfigState {
    fn default() -> Self {
        Self::new(LaunchConfig::default())
    }
}

/// Parse CLI arguments and create launch config
pub fn parse_args() -> LaunchConfig {
    let args = CliArgs::parse();

    let from_cli = args.plan.is_some() || args.agent.is_some() || args.cwd.is_some();

    LaunchConfig {
        plan_path: args.plan.map(|p| p.to_string_lossy().to_string()),
        agent: args.agent,
        cwd: args.cwd.map(|p| p.to_string_lossy().to_string()),
        from_cli,
    }
}

/// Get the launch configuration
#[tauri::command]
pub fn get_launch_config(state: tauri::State<'_, LaunchConfigState>) -> LaunchConfig {
    state.get()
}

/// Validate an agent name
#[allow(dead_code)]
fn is_valid_agent(agent: &str) -> bool {
    matches!(agent, "claude-code" | "codex" | "opencode" | "claude_code")
}

/// Normalize agent name to snake_case
#[allow(dead_code)]
pub fn normalize_agent_name(agent: &str) -> String {
    match agent {
        "claude-code" => "claude_code".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_launch_config_serialization() {
        let config = LaunchConfig {
            plan_path: Some("/path/to/plan.md".to_string()),
            agent: Some("claude-code".to_string()),
            cwd: Some("/home/user".to_string()),
            from_cli: true,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("planPath"));
        assert!(json.contains("fromCli"));
    }

    #[test]
    fn test_launch_config_default() {
        let config = LaunchConfig::default();
        assert!(!config.from_cli);
        assert!(config.plan_path.is_none());
    }

    #[test]
    fn test_is_valid_agent() {
        assert!(is_valid_agent("claude-code"));
        assert!(is_valid_agent("codex"));
        assert!(is_valid_agent("opencode"));
        assert!(!is_valid_agent("invalid"));
    }

    #[test]
    fn test_normalize_agent_name() {
        assert_eq!(normalize_agent_name("claude-code"), "claude_code");
        assert_eq!(normalize_agent_name("codex"), "codex");
    }
}
