fn main() {
    println!("cargo:rerun-if-changed=icons");
    if std::env::var("PROFILE").as_deref() == Ok("release") && tauri_build::is_dev() {
        panic!("Release builds must embed the UI. Run npm run desktop:build:exe (or npm run desktop:build) instead of cargo build --release.");
    }
    tauri_build::build()
}
