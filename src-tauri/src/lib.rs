//! The Rust side of Immersion. It owns three jobs for now: remembering which world
//! folder is open on this machine, reading files inside that folder for the screens,
//! and serving the folder's images to the webview through the `world` URL scheme.
//! Every path from the screens is relative to the world folder, and nothing outside
//! that folder can be reached.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, State};

/// The world folder open in this window, if any.
#[derive(Default)]
struct OpenWorld(Mutex<Option<PathBuf>>);

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

/// Opens a world folder and remembers it for the next launch on this machine.
#[tauri::command]
fn open_world(path: String, state: State<OpenWorld>, app: AppHandle) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.join("world.md").is_file() {
        return Err(format!("{path} has no world.md, so it is not a world folder"));
    }
    *state.0.lock().unwrap() = Some(folder);
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
        .manage(OpenWorld::default())
        .register_uri_scheme_protocol("world", |ctx, request| {
            serve_world_file(ctx.app_handle(), request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            open_world,
            remembered_world,
            close_world,
            read_text,
            read_dir,
            exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running Immersion");
}

#[cfg(test)]
mod tests {
    use super::inside;
    use std::path::Path;

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
