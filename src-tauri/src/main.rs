#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod history;
mod layout;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            layout::read_layout,
            layout::write_layout,
            layout::merge_layout,
            layout::generate_layout,
            history::get_latest_snapshot,
            history::list_snapshot_timestamps,
            history::clear_snapshots,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
