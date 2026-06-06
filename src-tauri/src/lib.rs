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

      WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("ShokadoPDF")
        .inner_size(1280.0, 800.0)
        .resizable(true)
        .initialization_script(CUSTOMIZE_JS)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
