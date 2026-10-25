# Microsoft Store Publishing — STXIC Halo

**Status:** checklist and research; not submitted, approved or signed as of 2026-10-25.

## Official documentation
- Microsoft Store onboarding: https://learn.microsoft.com/en-us/windows/apps/publish/get-started
- Win32 distribution: https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store
- Tauri Windows installer: https://tauri.app/distribute/windows-installer/
- Tauri Store guide: https://tauri.app/distribute/microsoft-store/

## Recommended path for this Tauri starter
Tauri currently bundles MSI or NSIS setup EXE. Microsoft Store accepts a **signed, hosted, offline EXE/MSI installer** as an unpackaged Win32 listing, or you can separately package a Win32 app as MSIX (with different signing/update benefits). Tauri's official Store guide documents the EXE/MSI path. See current documentation at build time.

**Important:** Microsoft Store does **not** automatically sign EXE/MSI for you. You must sign those installers yourself. MSIX Store submissions can receive Microsoft signing. The Store EXE/MSI path also has installer hosting and update responsibility implications.

## Gate 1 — Identity and naming
- [ ] Check STXIC Halo availability in Partner Center.
- [ ] Trademark/confusing-similarity search with counsel as appropriate.
- [ ] Own and verify privacy/support/domain URLs; avoid placeholders in final store submission.
- [ ] Finalize developer publisher identity, contact and documentation.

## Gate 2 — Product quality
- [ ] Implement required tray recovery, close/quit, launch-on-login controls.
- [ ] Validate app across Windows 10/11 x64 test matrix and supported screen scales.
- [ ] Confirm hook opt-in/uninstall rollback, no misleading telemetry.
- [ ] Check keyboard nav, screen reader, reduced motion and color contrast.
- [ ] Verify no unexpected outbound network traffic; accurate privacy policy.
- [ ] Test clean installer/uninstaller/update on VM.

## Gate 3 — Binary packaging
- [ ] Install Node/Rust/MSVC toolchain and run `npm run desktop:build` on Windows.
- [ ] For the EXE/MSI route, configure **offline WebView2 installer mode** for the Store candidate, as described by Tauri.
- [ ] Set definitive identifier, version, copyright, images, license notices and supported architectures.
- [ ] Authenticode sign binary and installer with a valid signing certificate; record SHA-256 hashes.
- [ ] Host a permanent HTTPS offline-installer URL without replacing bytes after submission.
- [ ] Design and test an authentic update mechanism for unpackaged EXE/MSI distribution.
- [ ] Run Microsoft Windows App Certification Kit and Defender scans.

## Gate 4 — Partner Center
- [ ] Create an EXE/MSI application and reserve the exact name.
- [ ] Configure countries/regions, price, category, age rating and system requirements.
- [ ] Provide signed installer URL, metadata, images, screenshots, help and privacy URL.
- [ ] Explain opt-in Claude hook collection to certification reviewers if needed.
- [ ] Submit and resolve certification issues before announcing availability.

## Candidate Tauri config override (example)
Create a temporary Store-specific config file when you are ready:

```json
{
  "bundle": {
    "windows": { "webviewInstallMode": { "type": "offlineInstaller" } }
  }
}
```

Then build with the config merge option documented by the matching installed Tauri CLI version. Do not assume this is already active in the starter's `tauri.conf.json`.

## Listing honesty
Do not list Codex, Proof-of-Work, interactive approvals, GPU, gaming FPS, or agent conflict alerts as shipped capabilities unless implemented and verified. Example listing draft is in `STORE_LISTING.md` and should be updated to reflect the final release.
