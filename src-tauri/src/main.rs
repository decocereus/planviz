#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

mod agent;
mod chat;
mod credentials;
mod history;
mod layout;
mod pty;
mod watcher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(watcher::WatcherState::default()))
        .manage(pty::PtyManager::default())
        .manage(agent::AgentManager::default())
        .invoke_handler(tauri::generate_handler![
            layout::read_layout,
            layout::write_layout,
            layout::merge_layout,
            layout::generate_layout,
            history::get_latest_snapshot,
            history::list_snapshot_timestamps,
            history::clear_snapshots,
            watcher::start_watching,
            watcher::stop_watching,
            watcher::get_watched_plan,
            chat::send_chat_message,
            pty::pty_create_session,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_stop,
            pty::pty_remove,
            pty::pty_is_running,
            credentials::check_credentials,
            credentials::get_agent_cli_command,
            agent::agent_connect,
            agent::agent_disconnect,
            agent::agent_send_message,
            agent::agent_get_session,
            agent::agent_check_available,
            agent::agent_process_output,
            agent::agent_finish_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
