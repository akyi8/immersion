//! The Rust side of Immersion. It keeps this machine's shelf of worlds, reads and
//! writes files inside the open world folder for the screens, watches that folder so
//! edits made in other programs appear in the app, and serves images to the webview
//! through two URL schemes: `world` for the open world's files and `shelf` for the
//! covers on the shelf. Every path from the screens is relative to the world folder,
//! and nothing outside that folder can be reached, except through the shelf commands,
//! which act only on folders the player chose.

use serde::{Deserialize, Serialize};
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
    /// When the file last changed, in milliseconds since 1970, if the system knows.
    modified: Option<u64>,
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

/// What this machine remembers: the library, the shelf of worlds, and the one opened last.
#[derive(Serialize, Deserialize, Default)]
struct Settings {
    /// The world opened last, which the app opens again at launch.
    #[serde(default)]
    world: Option<String>,
    /// Every world added on this machine, in the order they joined it. Worlds inside the
    /// library are found there and need no place in this list.
    #[serde(default)]
    worlds: Vec<String>,
    /// The library (Mike, October 26): one folder that holds the writer's worlds and
    /// `immersion.md`, and syncs between computers. Where it is, is the one thing each
    /// computer must remember for itself.
    #[serde(default)]
    library: Option<String>,
    /// True once the writer has answered where the library is, or chosen "Not now".
    #[serde(default)]
    library_asked: bool,
    /// Library worlds taken off this computer's Worlds page.
    #[serde(default)]
    hidden: Vec<String>,
    /// Whether worlds in a Git library sync on their own. On unless switched off.
    #[serde(default = "on")]
    git_sync: bool,
}

fn on() -> bool {
    true
}

/// The file in the library that holds what follows the writer to every computer.
const YOU_FILE: &str = "immersion.md";

/// Folders the library scan never enters, because they hold code, builds, or old work.
const NOT_WORLDS: [&str; 7] = ["node_modules", "target", "dist", "build", "archive", "old", "export"];

/// Every world in the library: any folder up to two levels down with a `world.md`. A
/// world's own folders are not searched for more worlds.
fn library_worlds(library: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
        if dir.join("world.md").is_file() {
            out.push(dir.to_path_buf());
            return;
        }
        if depth == 0 {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else { return };
        let mut dirs: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .filter(|e| e.path().is_dir())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_lowercase();
                !name.starts_with('.') && !NOT_WORLDS.contains(&name.as_str())
            })
            .map(|e| e.path())
            .collect();
        dirs.sort();
        for d in dirs {
            walk(&d, depth - 1, out);
        }
    }
    let mut out = Vec::new();
    walk(library, 2, &mut out);
    out
}

/// The Worlds page, in order: the library's worlds, then those added on this computer
/// alone. Each comes with whether it lives outside the library.
fn shelf_paths(settings: &Settings) -> Vec<(String, bool)> {
    let library = settings.library.as_ref().map(PathBuf::from);
    let mut out: Vec<(String, bool)> = Vec::new();
    if let Some(lib) = &library {
        for w in library_worlds(lib) {
            let path = w.to_string_lossy().into_owned();
            if !settings.hidden.contains(&path) {
                out.push((path, false));
            }
        }
    }
    for path in &settings.worlds {
        let inside_library = library.as_ref().is_some_and(|lib| Path::new(path).starts_with(lib));
        if !inside_library && !out.iter().any(|(p, _)| p == path) {
            out.push((path.clone(), true));
        }
    }
    out
}

fn load_settings(app: &AppHandle) -> Settings {
    let mut settings: Settings = settings_file(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    // Builds before the shelf remembered only the last world, which joins the shelf.
    if let Some(last) = settings.world.clone() {
        if !settings.worlds.contains(&last) {
            settings.worlds.push(last);
        }
    }
    settings
}

fn save_settings(app: &AppHandle, settings: &Settings) {
    if let Some(file) = settings_file(app) {
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(settings) {
            let _ = fs::write(file, text);
        }
    }
}

fn remember(app: &AppHandle, path: &str) {
    let mut settings = load_settings(app);
    if !settings.worlds.iter().any(|w| w == path) {
        settings.worlds.push(path.to_string());
    }
    save_settings(app, &settings);
}

const IMAGE_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

/// The image that belongs to a file stem, such as `world` or `wiki/people/cerys`.
fn image_for(stem: &Path) -> Option<PathBuf> {
    IMAGE_EXTENSIONS.iter().map(|ext| stem.with_extension(ext)).find(|p| p.is_file())
}

/// Copies a picture to `<stem>.<its extension>`, replacing any earlier picture for the
/// same stem, so a file never has two images. The original picture stays where it was.
fn place_image(stem: &Path, source: &Path) -> Result<PathBuf, String> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| IMAGE_EXTENSIONS.contains(&e.as_str()))
        .ok_or("Pictures can be JPEG, PNG, or WebP files.")?;
    let target = stem.with_extension(&ext);
    let mut temp = target.clone().into_os_string();
    temp.push(SAVING_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::copy(source, &temp).map_err(|e| format!("Could not copy the picture: {e}"))?;
    for other in IMAGE_EXTENSIONS.iter().filter(|e| **e != ext) {
        let _ = fs::remove_file(stem.with_extension(other));
    }
    fs::rename(&temp, &target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save the picture: {e}")
    })?;
    Ok(target)
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

/// Opens a world folder, puts it on the shelf, and remembers it for the next launch.
#[tauri::command]
fn open_world(path: String, state: State<OpenWorld>, app: AppHandle) -> Result<(), String> {
    let folder = PathBuf::from(&path);
    if !folder.join("world.md").is_file() {
        return Err(format!("{path} has no world.md, so it is not a world folder"));
    }
    close_readers(&app);
    *state.0.lock().unwrap() = Some(folder.clone());
    watch(&app, folder);
    remember(&app, &path);
    let mut settings = load_settings(&app);
    settings.world = Some(path);
    save_settings(&app, &settings);
    Ok(())
}

/// Closes every reading window. They show pages of the open world, so they close when
/// the world does (Mike, October 25).
fn close_readers(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("reader-") {
            let _ = window.close();
        }
    }
}

/// The world folder opened last time, if it still exists.
#[tauri::command]
fn remembered_world(app: AppHandle) -> Option<String> {
    let path = load_settings(&app).world?;
    Path::new(&path).join("world.md").is_file().then_some(path)
}

/// Closes the open world, so the next launch shows the shelf. The shelf keeps it.
#[tauri::command]
fn close_world(state: State<OpenWorld>, app: AppHandle) {
    close_readers(&app);
    *state.0.lock().unwrap() = None;
    *app.state::<WorldWatcher>().0.lock().unwrap() = None;
    let mut settings = load_settings(&app);
    settings.world = None;
    save_settings(&app, &settings);
}

#[derive(Serialize)]
struct ShelfWorld {
    path: String,
    /// True for a world outside the library, which only this computer shows.
    local: bool,
    /// The text of `world.md`, which the screens read for the name and tagline.
    #[serde(rename = "worldMd")]
    world_md: Option<String>,
    /// Whether the world has a cover picture, served at `shelf://localhost/<position>`.
    #[serde(rename = "hasCover")]
    has_cover: bool,
}

/// Every world on this machine's shelf. A world whose folder is gone has no text.
#[tauri::command]
fn shelf(app: AppHandle) -> Vec<ShelfWorld> {
    shelf_paths(&load_settings(&app))
        .into_iter()
        .map(|(path, local)| {
            let folder = PathBuf::from(&path);
            ShelfWorld {
                world_md: fs::read_to_string(folder.join("world.md")).ok(),
                has_cover: image_for(&folder.join("world")).is_some(),
                path,
                local,
            }
        })
        .collect()
}

/// Takes a world off this computer's shelf. Its folder and files are untouched. A world
/// in the library stays in the library, and only this computer stops showing it.
#[tauri::command]
fn forget_world(path: String, app: AppHandle) {
    let mut settings = load_settings(&app);
    if settings.library.as_ref().is_some_and(|lib| Path::new(&path).starts_with(lib)) && !settings.hidden.contains(&path) {
        settings.hidden.push(path.clone());
    }
    settings.worlds.retain(|w| w != &path);
    if settings.world.as_deref() == Some(path.as_str()) {
        settings.world = None;
    }
    save_settings(&app, &settings);
}

#[derive(Serialize)]
struct FolderShape {
    #[serde(rename = "hasWorld")]
    has_world: bool,
    /// Each top-level subfolder and how many markdown files it holds at any depth.
    folders: Vec<(String, usize)>,
}

fn count_markdown(dir: &Path, depth: usize) -> usize {
    if depth > 8 {
        return 0;
    }
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .filter_map(Result::ok)
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| {
            let path = e.path();
            if path.is_dir() {
                count_markdown(&path, depth + 1)
            } else {
                usize::from(path.extension().is_some_and(|x| x.eq_ignore_ascii_case("md")))
            }
        })
        .sum()
}

/// Looks inside a folder the player picked, to help turn it into a world.
#[tauri::command]
fn inspect_folder(path: String) -> Result<FolderShape, String> {
    let folder = PathBuf::from(&path);
    let entries = fs::read_dir(&folder).map_err(|e| format!("Could not open {path}: {e}"))?;
    let mut folders: Vec<(String, usize)> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir() && !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| (e.file_name().to_string_lossy().into_owned(), count_markdown(&e.path(), 0)))
        .collect();
    folders.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    Ok(FolderShape { has_world: folder.join("world.md").is_file(), folders })
}

/// Puts an existing folder on the shelf. When the folder has no `world.md` yet, the
/// one the player described is written into it, and nothing else in it changes.
#[tauri::command]
fn add_world(path: String, world_md: Option<String>, app: AppHandle) -> Result<(), String> {
    let file = PathBuf::from(&path).join("world.md");
    if !file.is_file() {
        let text = world_md.ok_or(format!("{path} has no world.md"))?;
        fs::write(&file, text).map_err(|e| format!("Could not write world.md: {e}"))?;
    }
    remember(&app, &path);
    Ok(())
}

/// Creates a new world folder with its `world.md` and starter folders, and puts it on
/// the shelf. Returns the new folder's path.
#[tauri::command]
fn create_world(parent: String, folder: String, world_md: String, dirs: Vec<String>, app: AppHandle) -> Result<String, String> {
    let root = inside(Path::new(&parent), &folder)?;
    if root.exists() && fs::read_dir(&root).map(|mut d| d.next().is_some()).unwrap_or(true) {
        return Err(format!("{} already exists and is not empty", root.display()));
    }
    fs::create_dir_all(&root).map_err(|e| format!("Could not create {}: {e}", root.display()))?;
    for dir in &dirs {
        let path = inside(&root, dir)?;
        fs::create_dir_all(&path).map_err(|e| format!("Could not create {dir}: {e}"))?;
        // Git does not keep empty folders, so each starter folder holds a hidden marker.
        let _ = fs::write(path.join(".gitkeep"), "");
    }
    fs::write(root.join("world.md"), world_md).map_err(|e| format!("Could not write world.md: {e}"))?;
    let path = root.to_string_lossy().into_owned();
    remember(&app, &path);
    Ok(path)
}

/// Runs git inside a folder without flashing a console window on Windows.
fn git(root: &Path, args: &[&str]) -> Option<String> {
    let mut command = std::process::Command::new("git");
    command.arg("-C").arg(root).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Counts the words added in a word-level diff, by the date of the commit they came in.
fn added_words(diff: &str, mut add: impl FnMut(Option<&str>, usize)) {
    let mut date: Option<&str> = None;
    for line in diff.lines() {
        if let Some(d) = line.strip_prefix("IMMERSION-COMMIT ") {
            date = Some(d.trim());
        } else if line.starts_with("+++") {
            continue;
        } else if let Some(added) = line.strip_prefix('+') {
            let words = added.split_whitespace().filter(|w| w.chars().any(char::is_alphanumeric)).count();
            add(date, words);
        }
    }
}

#[derive(Serialize)]
struct Activity {
    /// Words added on each day that had commits, as `YYYY-MM-DD` and a count.
    days: Vec<(String, usize)>,
    /// Words written since the last commit, which the screens count toward today.
    uncommitted: usize,
}

/// Words written per day in one folder of the open world, read from git history
/// (design: the activity heatmap). Moved and renamed files do not count as writing,
/// and archive folders are left out. Returns nothing when the world is not in a git
/// repository or git is not installed.
#[tauri::command]
async fn writing_activity(dir: String, days: u32, state: State<'_, OpenWorld>) -> Result<Option<Activity>, String> {
    let root = root(&state)?;
    inside(&root, &dir)?;
    tauri::async_runtime::spawn_blocking(move || {
        git(&root, &["rev-parse", "--is-inside-work-tree"])?;
        let since = format!("--since={days} days ago");
        let path = format!("{dir}/");
        let exclude = format!(":(exclude,glob){dir}/**/archive/**");
        let log = git(
            &root,
            &["log", &since, "--date=short", "--pretty=format:IMMERSION-COMMIT %ad", "-p", "-M", "--word-diff=porcelain", "--no-color", "--", &path, &exclude],
        )?;
        let mut totals: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
        added_words(&log, |date, words| {
            if let Some(d) = date {
                *totals.entry(d.to_string()).or_default() += words;
            }
        });
        let mut uncommitted = 0;
        if let Some(pending) = git(&root, &["diff", "HEAD", "-M", "--word-diff=porcelain", "--no-color", "--", &path, &exclude]) {
            added_words(&pending, |_, w| uncommitted += w);
        }
        Some(Activity { days: totals.into_iter().collect(), uncommitted })
    })
    .await
    .map_err(|e| e.to_string())
}

/// Where new worlds go unless the player chooses otherwise: the library, or else
/// Documents/Immersion.
#[tauri::command]
fn default_library(app: AppHandle) -> Result<String, String> {
    if let Some(lib) = load_settings(&app).library {
        return Ok(lib);
    }
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(docs.join("Immersion").to_string_lossy().into_owned())
}

#[derive(Serialize)]
struct LibraryInfo {
    path: Option<String>,
    asked: bool,
    #[serde(rename = "gitSync")]
    git_sync: bool,
    /// Whether the library is kept in a Git repository.
    #[serde(rename = "isGit")]
    is_git: bool,
}

/// Where the library is on this computer, and how it syncs.
#[tauri::command]
fn library_info(app: AppHandle) -> LibraryInfo {
    let settings = load_settings(&app);
    let is_git = settings.library.as_ref().is_some_and(|lib| git(Path::new(lib), &["rev-parse", "--is-inside-work-tree"]).is_some_and(|o| o.trim() == "true"));
    LibraryInfo { path: settings.library, asked: settings.library_asked, git_sync: settings.git_sync, is_git }
}

/// Sets where the library is on this computer, or clears it. Either way the question
/// has been answered.
#[tauri::command]
fn set_library(path: Option<String>, app: AppHandle) -> Result<(), String> {
    if let Some(p) = &path {
        if !Path::new(p).is_dir() {
            return Err(format!("{p} is not a folder on this computer"));
        }
    }
    let mut settings = load_settings(&app);
    settings.library = path;
    settings.library_asked = true;
    save_settings(&app, &settings);
    Ok(())
}

/// Leaves the library for later; the question is not asked again on this computer.
#[tauri::command]
fn skip_library(app: AppHandle) {
    let mut settings = load_settings(&app);
    settings.library_asked = true;
    save_settings(&app, &settings);
}

#[tauri::command]
fn set_git_sync(on: bool, app: AppHandle) {
    let mut settings = load_settings(&app);
    settings.git_sync = on;
    save_settings(&app, &settings);
}

/// The text of the library's `immersion.md`, or None when there is no library or no file yet.
#[tauri::command]
fn read_you(app: AppHandle) -> Option<String> {
    let lib = load_settings(&app).library?;
    fs::read_to_string(Path::new(&lib).join(YOU_FILE)).ok()
}

/// Saves the library's `immersion.md`, through a temporary file so a crash never leaves half of it.
#[tauri::command]
fn write_you(text: String, app: AppHandle) -> Result<(), String> {
    let lib = load_settings(&app).library.ok_or("There is no library on this computer yet.")?;
    let target = Path::new(&lib).join(YOU_FILE);
    let temp = Path::new(&lib).join(format!("{YOU_FILE}{SAVING_SUFFIX}"));
    fs::write(&temp, text).map_err(|e| format!("Could not save {YOU_FILE}: {e}"))?;
    fs::rename(&temp, &target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save {YOU_FILE}: {e}")
    })
}

/// Saves a shelf world's `world.md`, used to change its name and tagline.
#[tauri::command]
fn write_world_md(path: String, text: String, app: AppHandle) -> Result<(), String> {
    if !load_settings(&app).worlds.contains(&path) {
        return Err("That world is not on the shelf".into());
    }
    let file = PathBuf::from(&path).join("world.md");
    let mut temp = file.clone().into_os_string();
    temp.push(SAVING_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::write(&temp, text).map_err(|e| format!("Could not save world.md: {e}"))?;
    fs::rename(&temp, &file).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save world.md: {e}")
    })
}

/// Sets a shelf world's cover by copying a picture in as its `world` image.
#[tauri::command]
fn set_world_cover(path: String, source: String, app: AppHandle) -> Result<(), String> {
    if !load_settings(&app).worlds.contains(&path) {
        return Err("That world is not on the shelf".into());
    }
    place_image(&PathBuf::from(&path).join("world"), Path::new(&source)).map(|_| ())
}

/// Sets the picture for a file in the open world, such as an entry's portrait.
/// `stem` is the file's path without its extension. Returns the picture's path.
#[tauri::command]
fn set_image(stem: String, source: String, state: State<OpenWorld>) -> Result<String, String> {
    let root = root(&state)?;
    let target = place_image(&inside(&root, &stem)?, Path::new(&source))?;
    Ok(target.strip_prefix(&root).unwrap_or(&target).to_string_lossy().replace('\\', "/"))
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
        .map(|entry| {
            let meta = entry.metadata().ok();
            DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                modified: meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64),
            }
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

/// Moves or renames a file or folder inside the world. Refuses to replace anything.
#[tauri::command]
fn move_path(from: String, to: String, state: State<OpenWorld>) -> Result<(), String> {
    let root = root(&state)?;
    let source = inside(&root, &from)?;
    let target = inside(&root, &to)?;
    if target.exists() {
        return Err(format!("{to} already exists"));
    }
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder for {to}: {e}"))?;
    }
    fs::rename(&source, &target).map_err(|e| format!("Could not move {from}: {e}"))
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

/// Serves `shelf://localhost/<position>` as the cover of that world on the shelf.
fn serve_cover(app: &AppHandle, uri_path: &str) -> Response<Vec<u8>> {
    let found = uri_path
        .trim_matches('/')
        .parse::<usize>()
        .ok()
        .and_then(|i| shelf_paths(&load_settings(app)).get(i).map(|(p, _)| p.clone()))
        .and_then(|w| image_for(&PathBuf::from(w).join("world")))
        .and_then(|p| fs::read(&p).ok().map(|bytes| (p, bytes)));
    match found {
        Some((path, bytes)) => Response::builder()
            .header(header::CONTENT_TYPE, mime_for(&path))
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(bytes)
            .unwrap(),
        None => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap(),
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
        // Closing the main window closes the reading windows too, so the app quits.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                close_readers(window.app_handle());
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(OpenWorld::default())
        .manage(WorldWatcher::default())
        .register_uri_scheme_protocol("world", |ctx, request| {
            serve_world_file(ctx.app_handle(), request.uri().path())
        })
        .register_uri_scheme_protocol("shelf", |ctx, request| {
            serve_cover(ctx.app_handle(), request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            open_world,
            remembered_world,
            close_world,
            read_text,
            read_dir,
            exists,
            write_text,
            create_dir,
            move_path,
            shelf,
            forget_world,
            inspect_folder,
            add_world,
            create_world,
            default_library,
            library_info,
            set_library,
            skip_library,
            set_git_sync,
            read_you,
            write_you,
            set_world_cover,
            write_world_md,
            writing_activity,
            set_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running Immersion");
}

#[cfg(test)]
mod tests {
    use super::{added_words, inside, library_worlds, place_image, relevant_change, shelf_paths, Settings};
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
    fn a_new_picture_replaces_the_old_one_for_the_same_stem() {
        let dir = std::env::temp_dir().join(format!("immersion-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("drop.png");
        let jpg = dir.join("drop.JPG");
        std::fs::write(&png, b"png").unwrap();
        std::fs::write(&jpg, b"jpg").unwrap();
        let stem = dir.join("wren");
        assert_eq!(place_image(&stem, &png).unwrap(), dir.join("wren.png"));
        assert_eq!(place_image(&stem, &jpg).unwrap(), dir.join("wren.jpg"));
        assert!(!dir.join("wren.png").exists());
        assert_eq!(std::fs::read(dir.join("wren.jpg")).unwrap(), b"jpg");
        assert!(png.exists() && jpg.exists());
        assert!(place_image(&stem, &dir.join("notes.txt")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn added_words_are_counted_by_commit_date() {
        let log = "IMMERSION-COMMIT 2026-10-23\ndiff --git a/s.md b/s.md\n+++ b/s.md\n@@ -1 +1 @@\n The\n+quiet harbor\n-old\n~\n+# Chapter 2\nIMMERSION-COMMIT 2026-10-24\n+one more\n";
        let mut seen = Vec::new();
        added_words(log, |d, w| seen.push((d.map(str::to_string), w)));
        assert_eq!(
            seen,
            vec![
                (Some("2026-10-23".to_string()), 2),
                (Some("2026-10-23".to_string()), 2),
                (Some("2026-10-24".to_string()), 2)
            ]
        );
    }

    #[test]
    fn the_library_finds_worlds_two_levels_down_and_skips_the_rest() {
        let lib = std::env::temp_dir().join(format!("immersion-library-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&lib);
        for dir in ["project-sc", "games/ashfall", "games/ashfall/wiki", "node_modules/pkg", ".git/x", "deep/a/b", "notes"] {
            std::fs::create_dir_all(lib.join(dir)).unwrap();
        }
        for world in ["project-sc", "games/ashfall", "games/ashfall/wiki", "node_modules/pkg", "deep/a/b"] {
            std::fs::write(lib.join(world).join("world.md"), "# A world\n").unwrap();
        }
        let found = library_worlds(&lib);
        assert_eq!(found, vec![lib.join("games").join("ashfall"), lib.join("project-sc")]);

        let elsewhere = "/somewhere/else/world".to_string();
        let settings = Settings {
            library: Some(lib.to_string_lossy().into_owned()),
            worlds: vec![lib.join("project-sc").to_string_lossy().into_owned(), elsewhere.clone()],
            hidden: vec![lib.join("games").join("ashfall").to_string_lossy().into_owned()],
            ..Default::default()
        };
        assert_eq!(shelf_paths(&settings), vec![(lib.join("project-sc").to_string_lossy().into_owned(), false), (elsewhere, true)]);
        let _ = std::fs::remove_dir_all(&lib);
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
