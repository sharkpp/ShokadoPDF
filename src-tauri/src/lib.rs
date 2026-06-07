use std::sync::{Arc, Mutex};
use tauri::webview::DownloadEvent;
use tauri::{WebviewUrl, WebviewWindowBuilder};

// Self-contained toast shown after a download (no dependency on page scripts).
// `{}` in format!() is only the JSON path; the JS braces live in these literals.
const TOAST_PREFIX: &str = "(function(p){try{var id='shokado-dl-toast';var o=document.getElementById(id);if(o)o.remove();var b=document.createElement('div');b.id=id;b.setAttribute('style','position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:90vw;background:#1f2937;color:#fff;border:1px solid #374151;border-radius:12px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45);font-size:14px;');var t1=document.createElement('div');t1.textContent='ダウンロードしました';t1.setAttribute('style','font-weight:600;margin-bottom:2px;');var t2=document.createElement('div');t2.textContent=p;t2.setAttribute('style','color:#9ca3af;font-size:12px;word-break:break-all;');b.appendChild(t1);b.appendChild(t2);(document.body||document.documentElement).appendChild(b);setTimeout(function(){var x=document.getElementById(id);if(x)x.remove();},8000);}catch(e){}})(";
const TOAST_SUFFIX: &str = ");";

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
        // Let the web UI handle HTML5 file drops itself; otherwise Tauri's
        // native drag-drop handler swallows the event and the page's drop
        // zones never fire.
        .disable_drag_drop_handler()
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
                  let _ = webview.eval(&format!("{}{}{}", TOAST_PREFIX, js, TOAST_SUFFIX));
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
