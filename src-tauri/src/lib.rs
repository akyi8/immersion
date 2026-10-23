//! The Rust side of Immersion. It remembers which world folder is open on this
//! machine, reads and writes files inside that folder for the screens, watches the
//! folder so edits made in other programs appear in the app, and serves the folder's
//! images to the webview through the `world` URL scheme. Every path from the screens is
//! relative to the world folder, and nothing outside that folder can be reached.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{header, Response, StatusCode};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

/// The world folder open in this window, if any.
#[derive(Default)]
struct OpenWorld(Mutex<Option<PathBuf>>);

/// Watches the open world folder. Dropping it stops the watching.
#[derive(Default)]
struct WorldWatcher(Mutex<Option<RecommendedWatcher>>);

/// Suffix of the temporary file used while saving, so a crash never leaves half a file.
const SAVING_SUFFIX: &str = ".immersion-saving";

#[derive(Serialize)]
struct DirEntry {
    name: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

/// Joins a relative path onto the world root, refusing any path that would leave it.
fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    for part in rel.split(['/', '\\']) {
        match part {
            "" | "." => continue,
            ".." => return Err(format!("{rel} reaches outside the world folder")),
            _ => path.push(part),
        }
    }
    Ok(path)
}

fn root(state: &State<OpenWorld>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "No world is open".to_string())
}

fn settings_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("settings.json"))
}

/// The path of a changed file relative to the world folder, unless it should be ignored:
/// hidden files and folders (such as `.git` and `.immersion`) and files mid-save.
fn relevant_change(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for part in rel.components() {
        let name = part.as_os_str().to_string_lossy();
        if name.starts_with('.') {
            return None;
        }
        parts.push(name.into_owned());
    }
    let joined = parts.join("/");
    (!joined.is_empty() && !joined.ends_with(SAVING_SUFFIX)).then_some(joined)
}

/// Starts watching a world folder. The screens hear about changes as a
/// `world-changed` event carrying the relative paths that changed.
fn watch(app: &AppHandle, root: PathBuf) {
    let handle = app.clone();
    let watched = root.clone();
    let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result {
            let paths: Vec<String> = event.paths.iter().filter_map(|p| relevant_change(&watched, p)).collect();
            if !paths.is_empty() {
                let _ = handle.emit("world-changed", paths);
            }
        }
    });
    if let Ok(mut watcher) = watcher {
        if watcher.watch(&root, RecursiveMode::Recursive).is_ok() {
            *app.state::<WorldWatcher>().0.lock().unwrap() = Some(watcher);
        }
    }
}

/// Opens a world folder and remembers it for the next launch on this machine.
#[tauri::command]
fn open_world(path: String, state: State<OpenWorld>, app: AppHandle) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.join("world.md").is_file() {
        return Err(format!("{path} has no world.md, so it is not a world folder"));
    }
    *state.0.lock().unwrap() = Some(folder.clone());
    watch(&app, folder);
    if let Some(file) = settings_file(&app) {
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let _ = fs::write(file, serde_json::json!({ "world": path }).to_string());
    }
    Ok(())
}

/// The world folder remembered from the last launch, if it still exists.
#[tauri::command]
fn remembered_world(app: AppHandle) -> Option<String> {
    let text = fs::read_to_string(settings_file(&app)?).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let path = value.get("world")?.as_str()?.to_string();
    Path::new(&path).join("world.md").is_file().then_some(path)
}

/// Forgets the open world, so the next launch asks for a folder again.
#[tauri::command]
fn close_world(state: State<OpenWorld>, app: AppHandle) {
    *state.0.lock().unwrap() = None;
    *app.state::<WorldWatcher>().0.lock().unwrap() = None;
    if let Some(file) = settings_file(&app) {
        let _ = fs::remove_file(file);
    }
}

#[tauri::command]
fn read_text(rel: String, state: State<OpenWorld>) -> Result<String, String> {
    let path = inside(&root(&state)?, &rel)?;
    fs::read_to_string(&path).map_err(|e| format!("Could not read {rel}: {e}"))
}

#[tauri::command]
fn read_dir(rel: String, state: State<OpenWorld>) -> Result<Vec<DirEntry>, String> {
    let path = inside(&root(&state)?, &rel)?;
    let entries = fs::read_dir(&path).map_err(|e| format!("Could not list {rel}: {e}"))?;
    Ok(entries
        .filter_map(Result::ok)
        .map(|entry| DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
        })
        .collect())
}

/// Saves a file by writing a temporary copy beside it and then renaming the copy over
/// the original, so the file on disk is always either the old version or the new one.
#[tauri::command]
fn write_text(rel: String, content: String, state: State<OpenWorld>) -> Result<(), String> {
    let path = inside(&root(&state)?, &rel)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder for {rel}: {e}"))?;
    }
    let mut temp = path.clone().into_os_string();
    temp.push(SAVING_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::write(&temp, content).map_err(|e| format!("Could not save {rel}: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save {rel}: {e}")
    })
}

/// Creates a folder, and any missing folders above it, inside the world.
#[tauri::command]
fn create_dir(rel: String, state: State<OpenWorld>) -> Result<(), String> {
    let path = inside(&root(&state)?, &rel)?;
    fs::create_dir_all(&path).map_err(|e| format!("Could not create {rel}: {e}"))
}

#[tauri::command]
fn exists(rel: String, state: State<OpenWorld>) -> bool {
    root(&state)
        .and_then(|r| inside(&r, &rel))
        .map(|p| p.exists())
        .unwrap_or(false)
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// Serves `world://localhost/<relative path>` from the open world folder.
fn serve_world_file(app: &AppHandle, uri_path: &str) -> Response<Vec<u8>> {
    let rel = percent_encoding::percent_decode_str(uri_path).decode_utf8_lossy().into_owned();
    let found = app
        .state::<OpenWorld>()
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or(())
        .and_then(|r| inside(&r, &rel).map_err(|_| ()))
        .and_then(|p| fs::read(&p).map(|bytes| (p, bytes)).map_err(|_| ()));
    match found {
        Ok((path, bytes)) => Response::builder()
            .header(header::CONTENT_TYPE, mime_for(&path))
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(bytes)
            .unwrap(),
        Err(()) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(OpenWorld::default())
        .manage(WorldWatcher::default())
        .register_uri_scheme_protocol("world", |ctx, request| {
            serve_world_file(ctx.app_handle(), request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            open_world,
            remembered_world,
            close_world,
            read_text,
            read_dir,
            exists,
            write_text,
            create_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running Immersion");
}

#[cfg(test)]
mod tests {
    use super::{inside, relevant_change};
    use std::path::Path;

    #[test]
    fn hidden_and_half_saved_files_are_not_reported() {
        let root = Path::new("/worlds/harrowgate");
        assert_eq!(
            relevant_change(root, &root.join("wiki").join("people").join("wren-okafor.md")),
            Some("wiki/people/wren-okafor.md".to_string())
        );
        assert_eq!(relevant_change(root, &root.join(".git").join("index")), None);
        assert_eq!(relevant_change(root, &root.join(".immersion").join("cache")), None);
        assert_eq!(relevant_change(root, &root.join("wiki").join("a.md.immersion-saving")), None);
        assert_eq!(relevant_change(root, Path::new("/elsewhere/file.md")), None);
    }

    #[test]
    fn relative_paths_stay_inside_the_world() {
        let root = Path::new("/worlds/harrowgate");
        assert_eq!(
            inside(root, "wiki/people/wren-okafor.md").unwrap(),
            root.join("wiki").join("people").join("wren-okafor.md")
        );
        assert_eq!(inside(root, "./world.md").unwrap(), root.join("world.md"));
        assert!(inside(root, "../secrets.txt").is_err());
        assert!(inside(root, "world-bible/../../x").is_err());
    }
}
