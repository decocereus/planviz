#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

mod history;
mod layout;
mod watcher;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(watcher::WatcherState::default()))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
