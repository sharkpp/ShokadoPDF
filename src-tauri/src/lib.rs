use std::sync::{Arc, Mutex};
use tauri::webview::DownloadEvent;
use tauri::{WebviewUrl, WebviewWindowBuilder};

// Desktop UI customization, injected before any page script runs.
// Keeps the upstream BentoPDF frontend (core/) untouched.
const CUSTOMIZE_JS: &str = include_str!("../customize.js");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Remember the intended download destination from the Requested event:
      // on macOS the Finished event never reports the path (API limitation).
      let last_dest: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

      WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("ShokadoPDF")
        .inner_size(1280.0, 800.0)
        .resizable(true)
        // Let the BentoPDF web UI handle HTML5 file drops itself; otherwise
        // Tauri's native drag-drop handler swallows the event and the page's
        // drop zones never fire.
        .disable_drag_drop_handler()
        .initialization_script(CUSTOMIZE_JS)
        // Show the saved path in a toast after each download. Registering this
        // handler also enables downloads in the webview.
        .on_download(move |webview, event| {
          match event {
            DownloadEvent::Requested { destination, .. } => {
              let s = destination.to_string_lossy().to_string();
              if !s.is_empty() {
                if let Ok(mut g) = last_dest.lock() {
                  *g = Some(s);
                }
              }
            }
            DownloadEvent::Finished { path, success, .. } => {
              if success {
                let p = path
                  .as_ref()
                  .map(|p| p.to_string_lossy().to_string())
                  .filter(|s| !s.is_empty())
                  .or_else(|| last_dest.lock().ok().and_then(|g| g.clone()))
                  .unwrap_or_else(|| "ダウンロードフォルダ".to_string());
                if let Ok(js) = serde_json::to_string(&p) {
                  let _ = webview.eval(&format!(
                    "window.__shokadoNotifyDownload&&window.__shokadoNotifyDownload({})",
                    js
                  ));
                }
              }
            }
            _ => {}
          }
          true
        })
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
