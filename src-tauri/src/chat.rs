//! Mock ACP client for chat functionality
//!
//! This module provides a mock implementation of the ACP client that returns
//! canned stream events to validate the frontend chat UI.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::sleep;

/// Stream event types matching the frontend types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamEventType {
    MessageStart,
    ContentBlockStart,
    ContentBlockDelta,
    ContentBlockStop,
    MessageStop,
    PlanUpdate,
}

/// Plan update payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanUpdate {
    pub node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

/// Stream event payload sent to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    #[serde(rename = "type")]
    pub event_type: StreamEventType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_update: Option<PlanUpdate>,
}

/// Canned responses for the mock client
const CANNED_RESPONSES: &[&str] = &[
    "I understand you're working on a plan. Let me help you with that. I can see your tasks and phases, and I'll do my best to assist you in making progress.",
    "Based on the current state of your plan, I notice there are some tasks that could be optimized. Would you like me to suggest some improvements?",
    "That's a great question! When working with plans, it's important to consider dependencies between tasks. Let me analyze your current setup.",
    "I've reviewed your plan structure. Here are some observations:\n\n1. Your phases are well-organized\n2. Task dependencies look logical\n3. Consider adding more granular tasks for complex items",
    "Let me help you break down this task into smaller, manageable pieces. This will make tracking progress easier and help identify bottlenecks early.",
];

/// Check if the message is a plan update command
fn is_plan_update_command(message: &str) -> Option<(&str, &str)> {
    let lower = message.to_lowercase();
    if lower.contains("mark") && lower.contains("complete") {
        // Extract task ID if mentioned (e.g., "mark t1 complete")
        for word in message.split_whitespace() {
            if word.starts_with('t') && word[1..].chars().all(|c| c.is_ascii_digit()) {
                return Some((word, "completed"));
            }
        }
    }
    if lower.contains("start") || lower.contains("begin") {
        for word in message.split_whitespace() {
            if word.starts_with('t') && word[1..].chars().all(|c| c.is_ascii_digit()) {
                return Some((word, "in_progress"));
            }
        }
    }
    None
}

/// Send a chat message and receive a streaming response
#[tauri::command]
pub async fn send_chat_message(app: AppHandle, message: String) -> Result<(), String> {
    // Log the incoming message
    println!("Received chat message: {}", message);

    // Check for plan update commands
    let plan_update = is_plan_update_command(&message);

    // Select a canned response based on message hash
    let response_index = message.len() % CANNED_RESPONSES.len();
    let base_response = CANNED_RESPONSES[response_index];

    // Modify response if this is a plan update
    let response = if let Some((task_id, status)) = plan_update {
        format!(
            "I'll {} task {} for you.\n\n{}",
            if status == "completed" { "mark as complete" } else { "start" },
            task_id,
            base_response
        )
    } else {
        base_response.to_string()
    };

    // Emit message_start event
    emit_event(&app, StreamEvent {
        event_type: StreamEventType::MessageStart,
        content: None,
        plan_update: None,
    })?;

    // Small delay before starting content
    sleep(Duration::from_millis(100)).await;

    // Emit content_block_start event
    emit_event(&app, StreamEvent {
        event_type: StreamEventType::ContentBlockStart,
        content: None,
        plan_update: None,
    })?;

    // Stream the response character by character (grouped for efficiency)
    let chunk_size = 3; // Characters per chunk
    let chars: Vec<char> = response.chars().collect();

    for chunk in chars.chunks(chunk_size) {
        let content: String = chunk.iter().collect();

        emit_event(&app, StreamEvent {
            event_type: StreamEventType::ContentBlockDelta,
            content: Some(content),
            plan_update: None,
        })?;

        // Variable delay to simulate realistic typing
        let delay = if chunk.contains(&'\n') { 50 } else { 20 };
        sleep(Duration::from_millis(delay)).await;
    }

    // Emit content_block_stop event
    emit_event(&app, StreamEvent {
        event_type: StreamEventType::ContentBlockStop,
        content: None,
        plan_update: None,
    })?;

    // If this was a plan update command, emit the plan update event
    if let Some((task_id, status)) = plan_update {
        sleep(Duration::from_millis(100)).await;

        emit_event(&app, StreamEvent {
            event_type: StreamEventType::PlanUpdate,
            content: None,
            plan_update: Some(PlanUpdate {
                node_id: task_id.to_string(),
                status: Some(status.to_string()),
                content: None,
            }),
        })?;
    }

    // Small delay before message stop
    sleep(Duration::from_millis(50)).await;

    // Emit message_stop event
    emit_event(&app, StreamEvent {
        event_type: StreamEventType::MessageStop,
        content: None,
        plan_update: None,
    })?;

    Ok(())
}

/// Helper to emit a stream event
fn emit_event(app: &AppHandle, event: StreamEvent) -> Result<(), String> {
    app.emit("chat-stream", event)
        .map_err(|e| format!("Failed to emit event: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stream_event_serialization() {
        let event = StreamEvent {
            event_type: StreamEventType::ContentBlockDelta,
            content: Some("Hello".to_string()),
            plan_update: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("content_block_delta"));
        assert!(json.contains("Hello"));
    }

    #[test]
    fn test_plan_update_serialization() {
        let event = StreamEvent {
            event_type: StreamEventType::PlanUpdate,
            content: None,
            plan_update: Some(PlanUpdate {
                node_id: "t1".to_string(),
                status: Some("completed".to_string()),
                content: None,
            }),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("plan_update"));
        assert!(json.contains("nodeId")); // camelCase
        assert!(json.contains("t1"));
    }
}
