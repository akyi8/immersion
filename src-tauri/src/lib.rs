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
use std::sync::{Condvar, Mutex};
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
    /// When each world was last opened on this computer, in milliseconds since 1970, so
    /// the Worlds page shows the most recent first (Mike, October 26).
    #[serde(default)]
    opened: std::collections::HashMap<String, u64>,
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
    // Most recently opened first. Worlds never opened here keep their order after them.
    out.sort_by_key(|(p, _)| std::cmp::Reverse(settings.opened.get(p).copied().unwrap_or(0)));
    out
}

/// Whether a world is on this computer's Worlds page, through the library or added here.
fn on_shelf(settings: &Settings, path: &str) -> bool {
    shelf_paths(settings).iter().any(|(p, _)| p == path)
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
    let previous = state.0.lock().unwrap().replace(folder.clone()).filter(|p| p != &folder);
    sync_in_background(&app, previous);
    watch(&app, folder);
    remember(&app, &path);
    let mut settings = load_settings(&app);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    settings.opened.insert(path.clone(), now);
    settings.world = Some(path);
    save_settings(&app, &settings);
    Ok(())
}

/// Syncs a world being left, on a thread of its own, so closing it never waits on the network.
fn sync_in_background(app: &AppHandle, root: Option<PathBuf>) {
    let Some(root) = root else { return };
    if !load_settings(app).git_sync {
        return;
    }
    let you = you_file(app);
    in_background(move || {
        let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let _ = sync_folder(&root, &name, you.as_deref());
    });
}

/// Syncs started in the background and not finished yet. Closing the app waits for them,
/// because a sync cut off by the app closing never reaches GitHub (Mike, October 27).
static PENDING: Mutex<usize> = Mutex::new(0);
static PENDING_DONE: Condvar = Condvar::new();

fn in_background(job: impl FnOnce() + Send + 'static) {
    *PENDING.lock().unwrap_or_else(|e| e.into_inner()) += 1;
    std::thread::spawn(move || {
        job();
        *PENDING.lock().unwrap_or_else(|e| e.into_inner()) -= 1;
        PENDING_DONE.notify_all();
    });
}

/// Waits for the background syncs to finish, for no longer than `limit`.
fn wait_for_background(limit: std::time::Duration) {
    let count = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    let _ = PENDING_DONE.wait_timeout_while(count, limit, |n| *n > 0);
}

/// The library's `immersion.md`, when this computer has a library.
fn you_file(app: &AppHandle) -> Option<PathBuf> {
    load_settings(app).library.map(|lib| Path::new(&lib).join(YOU_FILE))
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
    let previous = state.0.lock().unwrap().take();
    sync_in_background(&app, previous);
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

/// Runs git for syncing, returning its output or what it said went wrong. Git is never
/// allowed to stop and ask for a password, because nobody would see the question: a
/// login that is not already set up on this computer fails with a message instead.
fn git_run(dir: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = std::process::Command::new("git");
    command.arg("-C").arg(dir).args(args).env("GIT_TERMINAL_PROMPT", "0");
    if std::env::var_os("GIT_SSH_COMMAND").is_none() {
        command.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|e| format!("Git could not run: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err.is_empty() { String::from_utf8_lossy(&output.stdout).trim().to_string() } else { err })
    }
}

#[derive(Serialize, Debug, PartialEq)]
struct SyncReport {
    /// synced, local (committed, with nowhere to push), waiting (other work in the
    /// repository is in the way for now), off, not-git, or problem.
    state: String,
    message: String,
}

fn report(state: &str, message: impl Into<String>) -> SyncReport {
    SyncReport { state: state.to_string(), message: message.into() }
}

/// Only one sync runs at a time, so two never trip over each other in the same repository.
static SYNCING: Mutex<()> = Mutex::new(());

/// A pathspec for `file` from the top of the repository that `dir` is in, when the file
/// exists and belongs to that same repository.
fn repo_spec(dir: &Path, file: &Path) -> Option<String> {
    if !file.is_file() {
        return None;
    }
    let top = fs::canonicalize(git_run(dir, &["rev-parse", "--show-toplevel"]).ok()?.trim()).ok()?;
    let rel = fs::canonicalize(file).ok()?.strip_prefix(&top).ok()?.to_path_buf();
    let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    Some(format!(":(top,literal){}", parts.join("/")))
}

/// Syncs one world through Git (Mike, October 26): commits the world's own folder and
/// nothing else, brings in what other computers pushed, and pushes. The library's
/// `immersion.md` rides along when it is in the same repository, because it holds the
/// vault's key settings and the author profiles (Mike, October 27). Other files in the
/// repository, such as a Claude session's unfinished work, are never committed. A
/// conflict stops the sync and is reported, and nothing is merged by guesswork.
fn sync_folder(root: &Path, name: &str, you: Option<&Path>) -> SyncReport {
    let mut specs = vec![".".to_string()];
    specs.extend(you.and_then(|f| repo_spec(root, f)));
    sync_paths(root, &specs, &format!("Immersion: {name}"))
}

/// Syncs the library's `immersion.md` alone, for when it changes with no world open, and
/// before a vault passphrase is chosen, so one chosen on another computer arrives first.
fn sync_you_file(file: &Path) -> SyncReport {
    let Some(dir) = file.parent() else { return report("not-git", "") };
    let specs: Vec<String> = repo_spec(dir, file).into_iter().collect();
    sync_paths(dir, &specs, "Immersion: you")
}

/// Commits these paths in the repository `dir` is in, then pulls and pushes.
fn sync_paths(dir: &Path, specs: &[String], message: &str) -> SyncReport {
    let _turn = SYNCING.lock().unwrap_or_else(|e| e.into_inner());
    if git_run(dir, &["rev-parse", "--is-inside-work-tree"]).map(|o| o.trim() == "true") != Ok(true) {
        return report("not-git", "This world is not in a Git repository.");
    }
    if git_run(dir, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok() {
        return report("problem", "Git is in the middle of a merge in this repository. Once it is finished or abandoned, syncing starts again.");
    }
    if !specs.is_empty() {
        let with = |first: &[&str]| -> Vec<String> {
            first.iter().map(|s| s.to_string()).chain(["--".to_string()]).chain(specs.iter().cloned()).collect()
        };
        let run = |args: Vec<String>| git_run(dir, &args.iter().map(String::as_str).collect::<Vec<_>>());
        let changed = match run(with(&["status", "--porcelain"])) {
            Ok(c) => c,
            Err(e) => return report("problem", e),
        };
        if !changed.trim().is_empty() {
            if let Err(e) = run(with(&["add", "-A"])) {
                return report("problem", e);
            }
            if let Err(e) = run(with(&["commit", "-m", message])) {
                return report("problem", e);
            }
        }
    }
    if git_run(dir, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).is_err() {
        return report("local", "Saved in Git on this computer. This branch has nowhere to push to, so other computers will not see it yet.");
    }
    if let Err(e) = git_run(dir, &["pull", "--no-rebase", "--no-edit"]) {
        if git_run(dir, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok() {
            let _ = git_run(dir, &["merge", "--abort"]);
            return report(
                "problem",
                "Another computer changed the same lines as this one, so Git could not bring its changes in. Nothing was lost, and syncing has stopped until the two versions are put together by hand.",
            );
        }
        if e.contains("would be overwritten") {
            return report(
                "waiting",
                "Other files in this repository have changes that are not committed yet, so Git cannot bring in changes from other computers right now. This world's own changes are saved in Git, and syncing tries again in a few minutes.",
            );
        }
        return report("problem", e);
    }
    if let Err(e) = git_run(dir, &["push"]) {
        return report("problem", e);
    }
    report("synced", "")
}

/// Syncs the open world through Git, when this computer has syncing switched on.
#[tauri::command]
async fn sync_world(name: String, state: State<'_, OpenWorld>, app: AppHandle) -> Result<SyncReport, String> {
    if !load_settings(&app).git_sync {
        return Ok(report("off", "Syncing is switched off on this computer."));
    }
    let root = root(&state)?;
    let you = you_file(&app);
    tauri::async_runtime::spawn_blocking(move || sync_folder(&root, &name, you.as_deref())).await.map_err(|e| e.to_string())
}

/// Syncs `immersion.md` now and says how it went.
#[tauri::command]
async fn sync_you(app: AppHandle) -> Result<SyncReport, String> {
    if !load_settings(&app).git_sync {
        return Ok(report("off", "Syncing is switched off on this computer."));
    }
    let Some(file) = you_file(&app) else { return Ok(report("not-git", "There is no library on this computer.")) };
    tauri::async_runtime::spawn_blocking(move || sync_you_file(&file)).await.map_err(|e| e.to_string())
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
    })?;
    if load_settings(&app).git_sync {
        in_background(move || {
            let _ = sync_you_file(&target);
        });
    }
    Ok(())
}

/// The folder in each world that holds its vault, hidden so Obsidian and the index pass it by.
const VAULT_DIR: &str = ".vault";

/// A vault file's name: random letters and digits, so the name tells nothing about the story.
fn vault_name_ok(name: &str) -> bool {
    name.len() == 31 && name.ends_with(".locked") && name[..24].chars().all(|c| c.is_ascii_hexdigit())
}

/// The vault folder of a world on the Worlds page, and the file inside it when a name is given.
fn vault_path(app: &AppHandle, world: &str, name: Option<&str>) -> Result<PathBuf, String> {
    if !on_shelf(&load_settings(app), world) {
        return Err("That world is not on the Worlds page".into());
    }
    let dir = Path::new(world).join(VAULT_DIR);
    match name {
        Some(n) if !vault_name_ok(n) => Err("That is not a vault file".into()),
        Some(n) => Ok(dir.join(n)),
        None => Ok(dir),
    }
}

/// The names of the stories in a world's vault (Mike, October 26). They are encrypted,
/// and the app decrypts them itself, in memory.
#[tauri::command]
fn vault_list(world: String, app: AppHandle) -> Result<Vec<String>, String> {
    let dir = vault_path(&app, &world, None)?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut names: Vec<String> = entries.filter_map(Result::ok).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| vault_name_ok(n)).collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
fn vault_read(world: String, name: String, app: AppHandle) -> Result<String, String> {
    fs::read_to_string(vault_path(&app, &world, Some(&name))?).map_err(|e| format!("Could not read the vault: {e}"))
}

/// Saves an encrypted story, through a temporary file so a crash never leaves half of it.
#[tauri::command]
fn vault_write(world: String, name: String, text: String, app: AppHandle) -> Result<(), String> {
    let target = vault_path(&app, &world, Some(&name))?;
    fs::create_dir_all(target.parent().unwrap()).map_err(|e| format!("Could not make the vault folder: {e}"))?;
    let temp = target.with_extension(format!("locked{SAVING_SUFFIX}"));
    fs::write(&temp, text).map_err(|e| format!("Could not save to the vault: {e}"))?;
    fs::rename(&temp, &target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save to the vault: {e}")
    })
}

/// Moves a story into the vault's own archive, still encrypted.
#[tauri::command]
fn vault_archive(world: String, name: String, app: AppHandle) -> Result<(), String> {
    let from = vault_path(&app, &world, Some(&name))?;
    let archive = from.parent().unwrap().join("archive");
    fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
    fs::rename(&from, archive.join(&name)).map_err(|e| format!("Could not archive it: {e}"))
}

/// The keychain entry for this library's vault key, when this computer remembers it.
fn vault_keychain(app: &AppHandle) -> Result<keyring::Entry, String> {
    let lib = load_settings(app).library.ok_or("There is no library on this computer yet.")?;
    keyring::Entry::new("Immersion vault", &lib).map_err(|e| e.to_string())
}

/// Remembers the vault key in this computer's own keychain, when the writer asks.
#[tauri::command]
fn vault_remember(key: String, app: AppHandle) -> Result<(), String> {
    vault_keychain(&app)?.set_password(&key).map_err(|e| format!("This computer's keychain would not keep it: {e}"))
}

#[tauri::command]
fn vault_recall(app: AppHandle) -> Option<String> {
    vault_keychain(&app).ok()?.get_password().ok()
}

#[tauri::command]
fn vault_forget(app: AppHandle) {
    if let Ok(entry) = vault_keychain(&app) {
        let _ = entry.delete_credential();
    }
}

/// The bytes of a picture the writer chose, so it can be encrypted into a story. Only
/// pictures can be read this way.
#[tauri::command]
fn read_picture(path: String) -> Result<tauri::ipc::Response, String> {
    let p = PathBuf::from(&path);
    let ok = p.extension().and_then(|e| e.to_str()).map(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false);
    if !ok {
        return Err("Pictures can be JPEG, PNG, or WebP files.".into());
    }
    fs::read(&p).map(tauri::ipc::Response::new).map_err(|e| format!("Could not read the picture: {e}"))
}

/// Saves a shelf world's `world.md`, used to change its name and tagline.
#[tauri::command]
fn write_world_md(path: String, text: String, app: AppHandle) -> Result<(), String> {
    if !on_shelf(&load_settings(&app), &path) {
        return Err("That world is not on the Worlds page".into());
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
    if !on_shelf(&load_settings(&app), &path) {
        return Err("That world is not on the Worlds page".into());
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
                let app = window.app_handle();
                close_readers(app);
                // The last of the day's writing syncs as the app closes, after any sync
                // still running from a world just closed.
                wait_for_background(std::time::Duration::from_secs(60));
                let open = app.state::<OpenWorld>().0.lock().unwrap().clone();
                if let Some(root) = open {
                    if load_settings(app).git_sync {
                        let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                        let _ = sync_folder(&root, &name, you_file(app).as_deref());
                    }
                }
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
            sync_you,
            write_you,
            set_world_cover,
            write_world_md,
            writing_activity,
            sync_world,
            vault_list,
            vault_read,
            vault_write,
            vault_archive,
            vault_remember,
            vault_recall,
            vault_forget,
            read_picture,
            set_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running Immersion");
}

#[cfg(test)]
mod tests {
    use super::{added_words, git_run, vault_name_ok, inside, library_worlds, place_image, relevant_change, shelf_paths, sync_folder, Settings};
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
        assert_eq!(shelf_paths(&settings), vec![(lib.join("project-sc").to_string_lossy().into_owned(), false), (elsewhere.clone(), true)]);
        // The world opened most recently comes first.
        let mut recent = settings;
        recent.opened.insert(elsewhere.clone(), 5);
        assert_eq!(shelf_paths(&recent)[0], (elsewhere.clone(), true));
        assert!(super::on_shelf(&recent, &lib.join("project-sc").to_string_lossy()));
        let _ = std::fs::remove_dir_all(&lib);
    }

    #[test]
    fn syncing_commits_only_the_world_and_meets_the_other_computer() {
        let base = std::env::temp_dir().join(format!("immersion-sync-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let remote = base.join("remote.git");
        let here = base.join("here");
        let there = base.join("there");
        std::fs::create_dir_all(&base).unwrap();
        let g = |dir: &std::path::Path, args: &[&str]| git_run(dir, args).unwrap();
        g(&base, &["init", "-q", "--bare", "-b", "main", remote.to_str().unwrap()]);
        g(&base, &["clone", "-q", remote.to_str().unwrap(), here.to_str().unwrap()]);
        for dir in [&here] {
            g(dir, &["config", "user.email", "test@example.com"]);
            g(dir, &["config", "user.name", "Test"]);
            g(dir, &["checkout", "-q", "-b", "main"]);
        }
        let world = here.join("ashfall");
        std::fs::create_dir_all(world.join("wiki")).unwrap();
        std::fs::write(world.join("world.md"), "# Ashfall\n").unwrap();
        std::fs::write(here.join("notes.md"), "a session's unfinished work\n").unwrap();
        g(&here, &["add", "notes.md"]);
        g(&here, &["commit", "-q", "-m", "start", "--", "notes.md"]);
        g(&here, &["push", "-q", "-u", "origin", "main"]);
        // A session has another file staged, which syncing must leave alone.
        std::fs::write(here.join("notes.md"), "a session's unfinished work, changed\n").unwrap();
        g(&here, &["add", "notes.md"]);

        assert_eq!(sync_folder(&world, "Ashfall", None).state, "synced");
        let last = g(&here, &["show", "--name-only", "--pretty=format:%s", "HEAD"]);
        assert!(last.starts_with("Immersion: Ashfall"));
        assert!(last.contains("ashfall/world.md") && !last.contains("notes.md"));
        assert!(g(&here, &["diff", "--cached", "--name-only"]).contains("notes.md"));

        // While that other work is staged, Git cannot merge, so syncing waits for it.
        std::fs::create_dir_all(base.join("early")).unwrap();
        g(&base, &["clone", "-q", remote.to_str().unwrap(), base.join("early").join("c").to_str().unwrap()]);
        let early = base.join("early").join("c");
        g(&early, &["config", "user.email", "test@example.com"]);
        g(&early, &["config", "user.name", "Test"]);
        std::fs::write(early.join("other.md"), "elsewhere\n").unwrap();
        g(&early, &["add", "-A"]);
        g(&early, &["commit", "-q", "-m", "early"]);
        g(&early, &["push", "-q"]);
        std::fs::write(world.join("wiki").join("ash.md"), "# Ash\n").unwrap();
        assert_eq!(sync_folder(&world, "Ashfall", None).state, "waiting");
        // Once the session commits its work, syncing goes through.
        g(&here, &["commit", "-q", "-m", "session", "--", "notes.md"]);
        assert_eq!(sync_folder(&world, "Ashfall", None).state, "synced");
        // An unstaged change elsewhere does not stop a sync.
        std::fs::write(here.join("notes.md"), "still being written\n").unwrap();

        // Another computer pushes a change, and the next sync brings it in.
        g(&base, &["clone", "-q", remote.to_str().unwrap(), there.to_str().unwrap()]);
        g(&there, &["config", "user.email", "test@example.com"]);
        g(&there, &["config", "user.name", "Test"]);
        // Git keeps no empty folders, so the other computer makes the wiki folder itself.
        std::fs::create_dir_all(there.join("ashfall").join("wiki")).unwrap();
        std::fs::write(there.join("ashfall").join("wiki").join("ember.md"), "# Ember\n").unwrap();
        g(&there, &["add", "-A"]);
        g(&there, &["commit", "-q", "-m", "there"]);
        g(&there, &["push", "-q"]);
        std::fs::write(world.join("wiki").join("cinder.md"), "# Cinder\n").unwrap();
        assert_eq!(sync_folder(&world, "Ashfall", None), super::report("synced", ""));
        assert!(world.join("wiki").join("ember.md").is_file());

        // The same line changed on both computers stops the sync without losing either.
        std::fs::write(there.join("ashfall").join("world.md"), "# Ashfall, there\n").unwrap();
        g(&there, &["pull", "-q", "--no-rebase", "--no-edit"]);
        g(&there, &["commit", "-q", "-am", "there again"]);
        g(&there, &["push", "-q"]);
        std::fs::write(world.join("world.md"), "# Ashfall, here\n").unwrap();
        let clash = sync_folder(&world, "Ashfall", None);
        assert_eq!(clash.state, "problem");
        assert_eq!(std::fs::read_to_string(world.join("world.md")).unwrap(), "# Ashfall, here\n");
        assert!(git_run(&here, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_you_file_rides_along_and_syncs_on_its_own() {
        let base = std::env::temp_dir().join(format!("immersion-you-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let remote = base.join("remote.git");
        let here = base.join("here");
        std::fs::create_dir_all(&base).unwrap();
        let g = |dir: &std::path::Path, args: &[&str]| git_run(dir, args).unwrap();
        g(&base, &["init", "-q", "--bare", "-b", "main", remote.to_str().unwrap()]);
        g(&base, &["clone", "-q", remote.to_str().unwrap(), here.to_str().unwrap()]);
        g(&here, &["config", "user.email", "test@example.com"]);
        g(&here, &["config", "user.name", "Test"]);
        g(&here, &["checkout", "-q", "-b", "main"]);
        std::fs::write(here.join("notes.md"), "start\n").unwrap();
        g(&here, &["add", "notes.md"]);
        g(&here, &["commit", "-q", "-m", "start"]);
        g(&here, &["push", "-q", "-u", "origin", "main"]);
        let world = here.join("project-ash").join("ashfall");
        std::fs::create_dir_all(&world).unwrap();
        std::fs::write(world.join("world.md"), "# Ashfall\n").unwrap();
        let you = here.join("immersion.md");
        std::fs::write(&you, "---\nlayout: soft\n---\n").unwrap();
        std::fs::write(here.join("notes.md"), "a session's unfinished work\n").unwrap();

        // A world's sync carries immersion.md, and still leaves other work alone.
        assert_eq!(sync_folder(&world, "Ashfall", Some(&you)).state, "synced");
        let last = g(&here, &["show", "--name-only", "--pretty=format:%s", "HEAD"]);
        assert!(last.contains("immersion.md") && last.contains("ashfall/world.md") && !last.contains("notes.md"));

        // With no world open, immersion.md syncs alone.
        std::fs::write(&you, "---\nlayout: classic\n---\n").unwrap();
        assert_eq!(super::sync_you_file(&you).state, "synced");
        let last = g(&here, &["show", "--name-only", "--pretty=format:%s", "HEAD"]);
        assert!(last.starts_with("Immersion: you") && last.contains("immersion.md") && !last.contains("notes.md"));
        assert!(g(&here, &["status", "--porcelain"]).contains("notes.md"));

        // A world outside the library's repository leaves immersion.md to the library.
        let alone = base.join("alone");
        std::fs::create_dir_all(&alone).unwrap();
        g(&alone, &["init", "-q", "-b", "main"]);
        g(&alone, &["config", "user.email", "test@example.com"]);
        g(&alone, &["config", "user.name", "Test"]);
        std::fs::write(alone.join("world.md"), "# Alone\n").unwrap();
        std::fs::write(&you, "---\nlayout: soft\n---\n").unwrap();
        assert_eq!(sync_folder(&alone, "Alone", Some(&you)).state, "local");
        assert!(g(&here, &["status", "--porcelain"]).contains("immersion.md"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn only_random_vault_names_are_accepted() {
        assert!(vault_name_ok("0123456789abcdef01234567.locked"));
        assert!(!vault_name_ok("../secrets/0123456789abcd.locked"));
        assert!(!vault_name_ok("the-night-on-the-pier.locked"));
        assert!(!vault_name_ok("0123456789abcdef01234567.md"));
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
