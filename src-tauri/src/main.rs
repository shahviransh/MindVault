#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--uninstall-cleanup") {
        mindvault_lib::uninstall_cleanup();
        return;
    }
    mindvault_lib::run();
}
