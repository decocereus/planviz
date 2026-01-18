//! PTY module for spawning and managing CLI processes
//!
//! Provides a cross-platform PTY abstraction for running Claude Code CLI
//! and other agent CLIs with full terminal emulation.

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// Default PTY size
const DEFAULT_ROWS: u16 = 24;
const DEFAULT_COLS: u16 = 80;

/// PTY output event sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    /// The output data (may contain ANSI escape codes)
    pub data: String,
    /// Session ID this output belongs to
    pub session_id: String,
}

/// PTY exit event sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    /// Session ID that exited
    pub session_id: String,
    /// Exit code if available
    pub exit_code: Option<i32>,
}

/// A PTY session managing a single process
pub struct PtySession {
    /// Unique session identifier
    pub id: String,
    /// The PTY pair (master/slave)
    pty_pair: PtyPair,
    /// Writer to send input to the PTY
    writer: Box<dyn Write + Send>,
    /// Flag indicating if the session is running
    running: Arc<AtomicBool>,
}

impl PtySession {
    /// Create a new PTY session
    pub fn new(id: String) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        Ok(Self {
            id,
            pty_pair,
            writer,
            running: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Spawn a command in this PTY session
    pub fn spawn(
        &mut self,
        command: &str,
        args: &[&str],
        cwd: Option<&str>,
        env: Option<Vec<(&str, &str)>>,
        app: AppHandle,
    ) -> Result<(), String> {
        let mut cmd = CommandBuilder::new(command);
        cmd.args(args);

        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        let mut child = self
            .pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        self.running.store(true, Ordering::SeqCst);

        // Get reader for output
        let mut reader = self
            .pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let session_id = self.id.clone();
        let running = self.running.clone();

        // Spawn thread to read PTY output and emit events
        thread::spawn(move || {
            let mut buf = [0u8; 4096];

            loop {
                if !running.load(Ordering::SeqCst) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - process exited
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        let event = PtyOutputEvent {
                            data,
                            session_id: session_id.clone(),
                        };

                        if let Err(e) = app.emit("pty-output", event) {
                            eprintln!("Failed to emit PTY output: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("PTY read error: {}", e);
                        break;
                    }
                }
            }

            running.store(false, Ordering::SeqCst);

            // Get exit code if possible
            let exit_code = child.wait().ok().map(|status| {
                if status.success() {
                    0
                } else {
                    1
                }
            });

            let exit_event = PtyExitEvent {
                session_id,
                exit_code,
            };

            if let Err(e) = app.emit("pty-exit", exit_event) {
                eprintln!("Failed to emit PTY exit: {}", e);
            }
        });

        Ok(())
    }

    /// Write input to the PTY
    pub fn write(&mut self, data: &str) -> Result<(), String> {
        self.writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        self.writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    }

    /// Resize the PTY
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        self.pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }

    /// Check if the session is still running
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Stop the session
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

/// Global PTY session manager
#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<std::collections::HashMap<String, PtySession>>,
}

impl PtyManager {
    /// Create a new session
    pub fn create_session(&self, id: String) -> Result<(), String> {
        let session = PtySession::new(id.clone())?;
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(id, session);
        Ok(())
    }

    /// Spawn a command in a session
    pub fn spawn_in_session(
        &self,
        session_id: &str,
        command: &str,
        args: Vec<String>,
        cwd: Option<String>,
        env: Option<Vec<(String, String)>>,
        app: AppHandle,
    ) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;

        let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        let env_refs: Option<Vec<(&str, &str)>> = env.as_ref().map(|e| {
            e.iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect()
        });

        session.spawn(command, &args_refs, cwd.as_deref(), env_refs, app)
    }

    /// Write to a session
    pub fn write_to_session(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.write(data)
    }

    /// Resize a session
    pub fn resize_session(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        session.resize(rows, cols)
    }

    /// Stop a session
    pub fn stop_session(&self, session_id: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(session_id) {
            session.stop();
        }
        Ok(())
    }

    /// Remove a session
    pub fn remove_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(session_id) {
            session.stop();
        }
        sessions.remove(session_id);
        Ok(())
    }

    /// Check if a session is running
    pub fn is_session_running(&self, session_id: &str) -> Result<bool, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        Ok(sessions
            .get(session_id)
            .map(|s| s.is_running())
            .unwrap_or(false))
    }
}

// Tauri commands

/// Create a new PTY session
#[tauri::command]
pub fn pty_create_session(
    session_id: String,
    state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    state.create_session(session_id)
}

/// Spawn a command in a PTY session
#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    session_id: String,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<Vec<(String, String)>>,
    state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    state.spawn_in_session(&session_id, &command, args, cwd, env, app)
}

/// Write to a PTY session
#[tauri::command]
pub fn pty_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    state.write_to_session(&session_id, &data)
}

/// Resize a PTY session
#[tauri::command]
pub fn pty_resize(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, PtyManager>,
) -> Result<(), String> {
    state.resize_session(&session_id, rows, cols)
}

/// Stop a PTY session
#[tauri::command]
pub fn pty_stop(session_id: String, state: tauri::State<'_, PtyManager>) -> Result<(), String> {
    state.stop_session(&session_id)
}

/// Remove a PTY session
#[tauri::command]
pub fn pty_remove(session_id: String, state: tauri::State<'_, PtyManager>) -> Result<(), String> {
    state.remove_session(&session_id)
}

/// Check if a PTY session is running
#[tauri::command]
pub fn pty_is_running(
    session_id: String,
    state: tauri::State<'_, PtyManager>,
) -> Result<bool, String> {
    state.is_session_running(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pty_output_event_serialization() {
        let event = PtyOutputEvent {
            data: "Hello, world!".to_string(),
            session_id: "session_1".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("sessionId")); // camelCase
        assert!(json.contains("Hello, world!"));
    }

    #[test]
    fn test_pty_exit_event_serialization() {
        let event = PtyExitEvent {
            session_id: "session_1".to_string(),
            exit_code: Some(0),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("sessionId"));
        assert!(json.contains("exitCode"));
    }
}
