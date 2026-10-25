mod enforcer;
mod hotkey;
mod oslock;
mod error;
mod policy;
mod schedule;
mod secrets;
mod session;
mod store;
mod tutor;

use crate::enforcer::HostEnforcer;
use crate::policy::{Level, ProcInfo};
use crate::secrets::KeyringSecrets;
use crate::session::{practice_mode, AppView, Mode, Service};
use crate::store::{Schedule, Store};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

struct AppState {
    svc: Mutex<Service>,
    watch: AtomicU64,
}

fn data_file() -> PathBuf {
    let base = std::env::var("APPDATA")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .or_else(|| std::env::var("USERPROFILE").ok())
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("MindVault").join("mindvault.db")
}

fn lock(state: &AppState) -> std::sync::MutexGuard<'_, Service> {
    state.svc.lock().unwrap_or_else(|err| err.into_inner())
}

pub fn uninstall_cleanup() {
    match open_live() {
        Ok(mut service) => {
            let _ = service.uninstall();
        }
        Err(_) => {
            let _ = enforcer::clear_platform();
        }
    }
}

fn open_live() -> Result<Service, String> {
    let store = Store::open(&data_file()).map_err(|err| err.to_string())?;
    Ok(Service::new(
        store,
        Box::new(HostEnforcer),
        Box::new(KeyringSecrets),
        Mode::Live,
    ))
}

fn snapshot() -> Vec<ProcInfo> {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    system
        .processes()
        .iter()
        .map(|(pid, process)| ProcInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            cmd: process
                .cmd()
                .iter()
                .map(|part| part.to_string_lossy().into_owned())
                .collect(),
        })
        .collect()
}

fn kill_pids(pids: &[u32]) {
    if pids.is_empty() || practice_mode() {
        return;
    }
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    for pid in pids {
        if let Some(process) = system.process(sysinfo::Pid::from_u32(*pid)) {
            let _ = process.kill();
        }
    }
}

fn tooltip(view: &AppView) -> String {
    match &view.session {
        Some(session) => format!(
            "MindVault {} until {}",
            session.level.as_str(),
            session.ends_at.with_timezone(&chrono::Local).format("%H:%M")
        ),
        None => "MindVault".into(),
    }
}

fn set_tray(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id("status") {
        let _ = tray.set_tooltip(Some(text));
    }
}

fn notify(app: &AppHandle, view: &AppView) {
    let Some(session) = &view.session else {
        return;
    };
    let _ = app
        .notification()
        .builder()
        .title("MindVault")
        .body(format!(
            "{} session until {}.",
            session.level.as_str(),
            session.ends_at.with_timezone(&chrono::Local).format("%H:%M")
        ))
        .show();
}

fn arm_watcher(app: &AppHandle) {
    let state = app.state::<AppState>();
    let generation = state.watch.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        let state = app.state::<AppState>();
        if state.watch.load(Ordering::SeqCst) != generation {
            break;
        }
        let procs = snapshot();
        let (pids, active, text) = {
            let mut service = lock(&state);
            let _ = service.expire_if_needed();
            let view = match service.view() {
                Ok(view) => view,
                Err(_) => break,
            };
            let active = view.session.is_some();
            let pids = if active {
                service.targets(&procs)
            } else {
                Vec::new()
            };
            (pids, active, tooltip(&view))
        };
        set_tray(&app, &text);
        hotkey::set_active(active);
        if !active {
            break;
        }
        kill_pids(&pids);
    });
}

fn run_scheduler(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        let started = {
            let state = app.state::<AppState>();
            let mut service = lock(&state);
            service
                .start_scheduled(chrono::Local::now().naive_local())
                .ok()
                .flatten()
        };
        if let Some(view) = started {
            arm_watcher(&app);
            notify(&app, &view);
        }
        std::thread::sleep(Duration::from_secs(30));
    });
}

fn disarm(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.watch.fetch_add(1, Ordering::SeqCst);
    hotkey::set_active(false);
    set_tray(app, "MindVault");
}

#[tauri::command]
fn get_state(state: State<AppState>) -> Result<AppView, String> {
    lock(&state).view().map_err(|err| err.to_string())
}

#[tauri::command]
fn enroll(state: State<AppState>, pin: String) -> Result<String, String> {
    lock(&state).enroll(&pin).map_err(|err| err.to_string())
}

#[tauri::command]
fn acknowledge_recovery(state: State<AppState>) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.acknowledge_recovery().map_err(|err| err.to_string())?;
    service.view().map_err(|err| err.to_string())
}

#[tauri::command]
fn reset_setup(state: State<AppState>, pin: String) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.reset_setup(&pin).map_err(|err| err.to_string())?;
    service.view().map_err(|err| err.to_string())
}

#[tauri::command]
fn set_entertainment(
    state: State<AppState>,
    pin: String,
    hosts: Vec<String>,
    programs: Vec<String>,
) -> Result<AppView, String> {
    let mut service = lock(&state);
    service
        .set_entertainment(&pin, &hosts, &programs)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn set_allowlist(state: State<AppState>, pin: String, hosts: Vec<String>) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.set_allowlist(&pin, &hosts).map_err(|err| err.to_string())
}

#[tauri::command]
fn set_api_config(
    state: State<AppState>,
    pin: String,
    base: String,
    model: String,
) -> Result<AppView, String> {
    let mut service = lock(&state);
    service
        .set_api_config(&pin, &base, &model)
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn probe_local_tutors() -> Vec<crate::tutor::LocalTutorStatus> {
    crate::tutor::probe_local_tutors().await
}

#[tauri::command]
fn set_api_key(state: State<AppState>, pin: String, key: String) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.set_api_key(&pin, &key).map_err(|err| err.to_string())
}

#[tauri::command]
fn start_session(
    app: AppHandle,
    state: State<AppState>,
    level: Level,
    minutes: u32,
    pin: Option<String>,
) -> Result<AppView, String> {
    let view = {
        let mut service = lock(&state);
        service
            .start_session(level, minutes, pin.as_deref())
            .map_err(|err| err.to_string())?
    };
    arm_watcher(&app);
    notify(&app, &view);
    Ok(view)
}

#[tauri::command]
fn set_schedules(state: State<AppState>, pin: String, schedules: Vec<Schedule>) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.set_schedules(&pin, &schedules).map_err(|err| err.to_string())
}

#[tauri::command]
fn poll(app: AppHandle, state: State<AppState>) -> Result<AppView, String> {
    let view = {
        let mut service = lock(&state);
        service.expire_if_needed().map_err(|err| err.to_string())?;
        service.view().map_err(|err| err.to_string())?
    };
    if view.session.is_none() {
        disarm(&app);
    }
    Ok(view)
}

#[tauri::command]
fn complete_block(state: State<AppState>) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.complete_block().map_err(|err| err.to_string())
}

#[tauri::command]
fn end_early(app: AppHandle, state: State<AppState>) -> Result<AppView, String> {
    let view = {
        let mut service = lock(&state);
        service.end_early().map_err(|err| err.to_string())?
    };
    disarm(&app);
    Ok(view)
}

#[tauri::command]
fn end_light(app: AppHandle, state: State<AppState>, pin: String) -> Result<AppView, String> {
    let view = {
        let mut service = lock(&state);
        service.end_light(&pin).map_err(|err| err.to_string())?
    };
    disarm(&app);
    Ok(view)
}

#[tauri::command]
fn end_with_recovery(app: AppHandle, state: State<AppState>, key: String) -> Result<AppView, String> {
    let view = {
        let mut service = lock(&state);
        service.end_with_recovery(&key).map_err(|err| err.to_string())?
    };
    disarm(&app);
    Ok(view)
}

fn reveal(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Creating a webview from a synchronous command deadlocks WebView2 on Windows,
/// so the study window never appears. This command stays async for that reason.
#[tauri::command]
async fn open_study(app: AppHandle, state: State<'_, AppState>, url: String) -> Result<(), String> {
    let (allow, blocked) = {
        let service = lock(&state);
        service.check_study_url(&url).map_err(|err| err.to_string())?;
        let view = service.view().map_err(|err| err.to_string())?;
        let allow = view
            .session
            .ok_or_else(|| "No session is running.".to_string())?
            .frozen_allow;
        (allow, view.entertainment_hosts)
    };
    let parsed = url::Url::parse(&url).map_err(|err| err.to_string())?;
    if let Some(window) = app.get_webview_window("study") {
        if window.navigate(parsed.clone()).is_ok() {
            reveal(&window);
            return Ok(());
        }
        let _ = window.close();
    }
    let navigation_allow = allow.clone();
    let navigation_block = blocked.clone();
    let popup_app = app.clone();
    let popup_allow = allow;
    let popup_block = blocked;
    let window = WebviewWindowBuilder::new(&app, "study", WebviewUrl::External(parsed))
        .title("MindVault Study")
        .inner_size(1040.0, 760.0)
        .focused(true)
        .on_navigation(move |next| {
            next.scheme() == "about"
                || policy::study_url_allowed_except(next.as_str(), &navigation_allow, &navigation_block).is_ok()
        })
        .on_new_window(move |url, _features| {
            if policy::study_url_allowed_except(url.as_str(), &popup_allow, &popup_block).is_ok() {
                if let Some(study) = popup_app.get_webview_window("study") {
                    let _ = study.navigate(url);
                    reveal(&study);
                }
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .on_download(|_, _| false)
        .build()
        .map_err(|err| err.to_string())?;
    reveal(&window);
    Ok(())
}

#[tauri::command]
async fn tutor(state: State<'_, AppState>, job: Value) -> Result<tutor::TutorView, String> {
    let parsed = tutor::parse_job(&job).map_err(|err| err.to_string())?;
    let prepared = {
        let service = lock(&state);
        service.prepare_tutor().map_err(|err| err.to_string())?
    };
    tutor::fetch_tutor(&prepared.base, &prepared.key, &prepared.model, &parsed)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
async fn classify_program(
    state: State<'_, AppState>,
    image_name: String,
    path: String,
    publisher: String,
) -> Result<AppView, String> {
    let prepared = {
        let service = lock(&state);
        service
            .prepare_classify(&image_name)
            .map_err(|err| err.to_string())?
    };
    let suggestion = tutor::fetch_classification(
        &prepared.base,
        &prepared.key,
        &prepared.model,
        &image_name,
        &path,
        &publisher,
    )
    .await
    .map_err(|err| err.to_string())?;
    let mut service = lock(&state);
    service
        .store_suggestion(suggestion)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn accept_suggestion(state: State<AppState>, pin: String) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.accept_suggestion(&pin).map_err(|err| err.to_string())
}

#[tauri::command]
fn dismiss_suggestion(state: State<AppState>, pin: String) -> Result<AppView, String> {
    let mut service = lock(&state);
    service.dismiss_suggestion(&pin).map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let service = open_live().map_err(|err| std::io::Error::other(err))?;
            app.manage(AppState {
                svc: Mutex::new(service),
                watch: AtomicU64::new(0),
            });
            if let Some(icon) = app.default_window_icon().cloned() {
                let show = MenuItem::with_id(app, "show", "Show MindVault", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show])?;
                let _ = TrayIconBuilder::with_id("status")
                    .tooltip("MindVault")
                    .icon(icon)
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        if event.id() == "show" {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            let resume = {
                let state = app.state::<AppState>();
                let mut service = lock(&state);
                service.heal().unwrap_or(false)
            };
            if resume {
                arm_watcher(app.handle());
            }
            run_scheduler(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            enroll,
            acknowledge_recovery,
            reset_setup,
            set_allowlist,
            set_entertainment,
            set_api_config,
            probe_local_tutors,
            set_api_key,
            start_session,
            set_schedules,
            poll,
            complete_block,
            end_early,
            end_light,
            end_with_recovery,
            open_study,
            tutor,
            classify_program,
            accept_suggestion,
            dismiss_suggestion
        ])
        .build(tauri::generate_context!())
        .expect("error while building MindVault")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                hotkey::set_active(false);
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(mut service) = state.svc.lock() {
                        let _ = service.on_process_exit();
                    }
                }
            }
        });
}
