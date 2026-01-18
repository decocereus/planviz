//! Agent adapter module
//!
//! Provides high-level interface for communicating with AI agents
//! (Claude Code, Codex, OpenCode) via PTY or direct API.

use crate::chat::StreamEvent;
use crate::credentials::{check_credentials, get_agent_cli_command, AgentType};
use crate::pty::PtyManager;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// Agent session state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    /// Session ID
    pub id: String,
    /// Agent type
    pub agent_type: AgentType,
    /// Working directory
    pub cwd: String,
    /// Whether the agent is connected
    pub connected: bool,
    /// Current status message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// Agent connection status event
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusEvent {
    /// Session ID
    pub session_id: String,
    /// Whether connected
    pub connected: bool,
    /// Status message
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Error if any
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Global agent manager state
pub struct AgentManager {
    /// Current active session
    current_session: Mutex<Option<AgentSession>>,
    /// Whether we're currently streaming a response
    streaming: AtomicBool,
    /// Buffer for accumulating output
    output_buffer: Mutex<String>,
}

impl Default for AgentManager {
    fn default() -> Self {
        Self {
            current_session: Mutex::new(None),
            streaming: AtomicBool::new(false),
            output_buffer: Mutex::new(String::new()),
        }
    }
}

impl AgentManager {
    /// Get the current session
    pub fn get_session(&self) -> Option<AgentSession> {
        self.current_session.lock().ok()?.clone()
    }

    /// Set the current session
    pub fn set_session(&self, session: Option<AgentSession>) {
        if let Ok(mut current) = self.current_session.lock() {
            *current = session;
        }
    }

    /// Check if streaming
    pub fn is_streaming(&self) -> bool {
        self.streaming.load(Ordering::SeqCst)
    }

    /// Set streaming state
    pub fn set_streaming(&self, value: bool) {
        self.streaming.store(value, Ordering::SeqCst);
    }

    /// Append to output buffer
    pub fn append_output(&self, data: &str) {
        if let Ok(mut buffer) = self.output_buffer.lock() {
            buffer.push_str(data);
        }
    }

    /// Clear and get the output buffer
    pub fn take_output(&self) -> String {
        if let Ok(mut buffer) = self.output_buffer.lock() {
            std::mem::take(&mut *buffer)
        } else {
            String::new()
        }
    }
}

/// Connect to an agent
#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    agent_type: AgentType,
    cwd: String,
    agent_state: tauri::State<'_, AgentManager>,
    pty_state: tauri::State<'_, PtyManager>,
) -> Result<AgentSession, String> {
    // Check credentials first
    let cred_status = check_credentials(agent_type);
    if !cred_status.found {
        return Err(cred_status.error.unwrap_or_else(|| "Credentials not found".to_string()));
    }

    if !cred_status.cli_available {
        return Err(format!("{:?} CLI is not installed", agent_type));
    }

    // Get the CLI command
    let cli_cmd = get_agent_cli_command(agent_type)?;

    // Generate session ID
    let session_id = format!("agent_{}_{}",
        match agent_type {
            AgentType::ClaudeCode => "claude",
            AgentType::Codex => "codex",
            AgentType::OpenCode => "opencode",
        },
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    // Create PTY session
    pty_state.create_session(session_id.clone())?;

    // Build command arguments based on agent type
    let args = match agent_type {
        AgentType::ClaudeCode => vec![
            "chat".to_string(),
            "--no-color".to_string(),
        ],
        AgentType::Codex => vec![
            "chat".to_string(),
        ],
        AgentType::OpenCode => {
            return Err("OpenCode uses ACP protocol, not PTY".to_string());
        }
    };

    // Spawn the CLI
    pty_state.spawn_in_session(
        &session_id,
        &cli_cmd,
        args,
        Some(cwd.clone()),
        None,
        app.clone(),
    )?;

    let session = AgentSession {
        id: session_id.clone(),
        agent_type,
        cwd,
        connected: true,
        status: Some("Connected".to_string()),
    };

    agent_state.set_session(Some(session.clone()));

    // Emit connection status
    app.emit("agent-status", AgentStatusEvent {
        session_id,
        connected: true,
        message: Some("Connected to agent".to_string()),
        error: None,
    }).map_err(|e| e.to_string())?;

    Ok(session)
}

/// Disconnect from the current agent
#[tauri::command]
pub async fn agent_disconnect(
    app: AppHandle,
    agent_state: tauri::State<'_, AgentManager>,
    pty_state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    let session = agent_state.get_session()
        .ok_or("No active agent session")?;

    // Stop and remove the PTY session
    pty_state.stop_session(&session.id)?;
    pty_state.remove_session(&session.id)?;

    agent_state.set_session(None);
    agent_state.set_streaming(false);

    // Emit disconnection status
    app.emit("agent-status", AgentStatusEvent {
        session_id: session.id,
        connected: false,
        message: Some("Disconnected".to_string()),
        error: None,
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Send a message to the agent
#[tauri::command]
pub async fn agent_send_message(
    app: AppHandle,
    message: String,
    agent_state: tauri::State<'_, AgentManager>,
    pty_state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    let session = agent_state.get_session()
        .ok_or("No active agent session")?;

    if agent_state.is_streaming() {
        return Err("Already processing a message".to_string());
    }

    agent_state.set_streaming(true);
    agent_state.take_output(); // Clear buffer

    // Send the message to the PTY (with newline to submit)
    let input = format!("{}\n", message);
    pty_state.write_to_session(&session.id, &input)?;

    // Emit message_start event
    app.emit("chat-stream", StreamEvent {
        event_type: crate::chat::StreamEventType::MessageStart,
        content: None,
        plan_update: None,
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get current agent session
#[tauri::command]
pub fn agent_get_session(
    agent_state: tauri::State<'_, AgentManager>,
) -> Option<AgentSession> {
    agent_state.get_session()
}

/// Check if an agent is available
#[tauri::command]
pub fn agent_check_available(agent_type: AgentType) -> Result<bool, String> {
    let status = check_credentials(agent_type);
    Ok(status.found && status.cli_available)
}

/// Process PTY output and convert to stream events
/// This is called from the frontend when it receives pty-output events
#[tauri::command]
pub fn agent_process_output(
    app: AppHandle,
    data: String,
    agent_state: tauri::State<'_, AgentManager>,
) -> Result<(), String> {
    // Accumulate output
    agent_state.append_output(&data);

    // For now, emit the raw output as content deltas
    // In a more sophisticated implementation, we would parse the output
    // to detect message boundaries, tool calls, etc.

    // Strip ANSI escape codes for cleaner output
    let clean_data = strip_ansi_codes(&data);

    if !clean_data.is_empty() {
        app.emit("chat-stream", StreamEvent {
            event_type: crate::chat::StreamEventType::ContentBlockDelta,
            content: Some(clean_data),
            plan_update: None,
        }).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Signal that the agent has finished responding
#[tauri::command]
pub fn agent_finish_response(
    app: AppHandle,
    agent_state: tauri::State<'_, AgentManager>,
) -> Result<(), String> {
    agent_state.set_streaming(false);

    // Emit message_stop event
    app.emit("chat-stream", StreamEvent {
        event_type: crate::chat::StreamEventType::MessageStop,
        content: None,
        plan_update: None,
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Strip ANSI escape codes from a string
fn strip_ansi_codes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_escape = false;

    for c in s.chars() {
        if in_escape {
            if c.is_ascii_alphabetic() {
                in_escape = false;
            }
        } else if c == '\x1b' {
            in_escape = true;
        } else {
            result.push(c);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_codes() {
        let input = "\x1b[32mHello\x1b[0m World";
        let output = strip_ansi_codes(input);
        assert_eq!(output, "Hello World");
    }

    #[test]
    fn test_agent_session_serialization() {
        let session = AgentSession {
            id: "test_123".to_string(),
            agent_type: AgentType::ClaudeCode,
            cwd: "/home/user".to_string(),
            connected: true,
            status: Some("Connected".to_string()),
        };

        let json = serde_json::to_string(&session).unwrap();
        assert!(json.contains("agentType"));
        assert!(json.contains("claude_code"));
    }

    #[test]
    fn test_agent_status_event_serialization() {
        let event = AgentStatusEvent {
            session_id: "test_123".to_string(),
            connected: true,
            message: Some("Connected".to_string()),
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("sessionId"));
        assert!(!json.contains("error")); // Should be skipped
    }
}
