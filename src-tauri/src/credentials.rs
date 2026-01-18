//! Credential discovery for Claude Code and Codex CLIs
//!
//! Reads credentials from:
//! - Claude: `~/.claude/.credentials.json` or macOS Keychain "Claude Code-credentials"
//! - Codex: `~/.codex/auth.json` or `CODEX_HOME` override, or macOS Keychain
//! - Environment variable overrides (CLAUDE_AI_SESSION_KEY, etc.)

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Claude Code credential format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCredentials {
    /// OAuth access token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// OAuth refresh token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Token expiry timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    /// Simple token (non-OAuth)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

/// Codex credential format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCredentials {
    /// Access token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// Refresh token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

/// Agent type for credential lookup
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    ClaudeCode,
    Codex,
    OpenCode,
}

/// Credential status returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    /// Whether credentials were found
    pub found: bool,
    /// Source of credentials (file, keychain, env)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Whether the CLI is installed and available
    pub cli_available: bool,
    /// Error message if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Get the Claude credentials file path
fn get_claude_credentials_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join(".credentials.json"))
}

/// Get the Codex credentials file path
fn get_codex_credentials_path() -> Option<PathBuf> {
    // Check CODEX_HOME env var first
    if let Ok(codex_home) = std::env::var("CODEX_HOME") {
        return Some(PathBuf::from(codex_home).join("auth.json"));
    }
    // Default to ~/.codex/auth.json
    dirs::home_dir().map(|h| h.join(".codex").join("auth.json"))
}

/// Read Claude credentials from file
fn read_claude_credentials_file() -> Option<ClaudeCredentials> {
    let path = get_claude_credentials_path()?;
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Read Codex credentials from file
fn read_codex_credentials_file() -> Option<CodexCredentials> {
    let path = get_codex_credentials_path()?;
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Check for Claude environment variable overrides
fn get_claude_env_credentials() -> Option<ClaudeCredentials> {
    // Check various env var names that might be used
    let session_key = std::env::var("CLAUDE_AI_SESSION_KEY")
        .or_else(|_| std::env::var("CLAUDE_WEB_SESSION_KEY"))
        .or_else(|_| std::env::var("ANTHROPIC_API_KEY"))
        .ok();

    session_key.map(|token| ClaudeCredentials {
        access_token: None,
        refresh_token: None,
        expires_at: None,
        token: Some(token),
    })
}

/// Check if Claude Code CLI is available
fn is_claude_cli_available() -> bool {
    // Check common locations for claude CLI
    which_exists("claude")
}

/// Check if Codex CLI is available
fn is_codex_cli_available() -> bool {
    which_exists("codex")
}

/// Check if a command exists in PATH
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Read credentials from macOS Keychain
#[cfg(target_os = "macos")]
fn read_keychain_credentials(service: &str, account: &str) -> Option<String> {
    use std::process::Command;

    let output = Command::new("security")
        .args(["find-generic-password", "-s", service, "-a", account, "-w"])
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn read_keychain_credentials(_service: &str, _account: &str) -> Option<String> {
    // Keychain not available on non-macOS platforms
    None
}

/// Get Claude credentials from Keychain
fn get_claude_keychain_credentials() -> Option<ClaudeCredentials> {
    let json = read_keychain_credentials("Claude Code-credentials", "Claude Code")?;
    serde_json::from_str(&json).ok()
}

/// Get Codex credentials from Keychain
fn get_codex_keychain_credentials() -> Option<CodexCredentials> {
    // Codex uses a hashed account name based on CODEX_HOME
    let codex_home = std::env::var("CODEX_HOME")
        .unwrap_or_else(|_| dirs::home_dir().map(|h| h.join(".codex").to_string_lossy().to_string()).unwrap_or_default());

    // Simple hash for account name (first 16 chars of hex)
    let hash = format!("{:x}", md5_simple(&codex_home));
    let account = format!("cli|{}", &hash[..16.min(hash.len())]);

    let json = read_keychain_credentials("Codex Auth", &account)?;
    serde_json::from_str(&json).ok()
}

/// Simple MD5-like hash (not cryptographic, just for account naming)
fn md5_simple(input: &str) -> u64 {
    let mut hash: u64 = 0;
    for byte in input.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u64);
    }
    hash
}

/// Check credential status for an agent
#[tauri::command]
pub fn check_credentials(agent: AgentType) -> CredentialStatus {
    match agent {
        AgentType::ClaudeCode => {
            let cli_available = is_claude_cli_available();

            // Check env vars first
            if get_claude_env_credentials().is_some() {
                return CredentialStatus {
                    found: true,
                    source: Some("environment".to_string()),
                    cli_available,
                    error: None,
                };
            }

            // Check file
            if read_claude_credentials_file().is_some() {
                return CredentialStatus {
                    found: true,
                    source: Some("file".to_string()),
                    cli_available,
                    error: None,
                };
            }

            // Check keychain
            if get_claude_keychain_credentials().is_some() {
                return CredentialStatus {
                    found: true,
                    source: Some("keychain".to_string()),
                    cli_available,
                    error: None,
                };
            }

            CredentialStatus {
                found: false,
                source: None,
                cli_available,
                error: Some("No Claude Code credentials found. Please run 'claude login' first.".to_string()),
            }
        }

        AgentType::Codex => {
            let cli_available = is_codex_cli_available();

            // Check file
            if read_codex_credentials_file().is_some() {
                return CredentialStatus {
                    found: true,
                    source: Some("file".to_string()),
                    cli_available,
                    error: None,
                };
            }

            // Check keychain
            if get_codex_keychain_credentials().is_some() {
                return CredentialStatus {
                    found: true,
                    source: Some("keychain".to_string()),
                    cli_available,
                    error: None,
                };
            }

            CredentialStatus {
                found: false,
                source: None,
                cli_available,
                error: Some("No Codex credentials found. Please run 'codex auth' first.".to_string()),
            }
        }

        AgentType::OpenCode => {
            // OpenCode uses ACP protocol directly, no CLI credentials needed
            CredentialStatus {
                found: true,
                source: Some("acp".to_string()),
                cli_available: true,
                error: None,
            }
        }
    }
}

/// Get the CLI command for an agent
#[tauri::command]
pub fn get_agent_cli_command(agent: AgentType) -> Result<String, String> {
    match agent {
        AgentType::ClaudeCode => {
            if is_claude_cli_available() {
                Ok("claude".to_string())
            } else {
                Err("Claude Code CLI not found. Please install it first.".to_string())
            }
        }
        AgentType::Codex => {
            if is_codex_cli_available() {
                Ok("codex".to_string())
            } else {
                Err("Codex CLI not found. Please install it first.".to_string())
            }
        }
        AgentType::OpenCode => {
            // OpenCode doesn't use a CLI
            Err("OpenCode uses ACP protocol directly".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_status_serialization() {
        let status = CredentialStatus {
            found: true,
            source: Some("file".to_string()),
            cli_available: true,
            error: None,
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("cliAvailable")); // camelCase
        assert!(json.contains("true"));
    }

    #[test]
    fn test_agent_type_serialization() {
        let agent = AgentType::ClaudeCode;
        let json = serde_json::to_string(&agent).unwrap();
        assert_eq!(json, "\"claude_code\"");
    }

    #[test]
    fn test_md5_simple() {
        let hash1 = md5_simple("test");
        let hash2 = md5_simple("test");
        let hash3 = md5_simple("different");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }
}
