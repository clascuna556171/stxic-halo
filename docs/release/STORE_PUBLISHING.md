# Microsoft Store Publishing — STXIC Halo

**Status:** MSIX Store pipeline ready (`npm run desktop:build:msix`); Partner Center app reservation & upload pending.

## Official documentation
- Microsoft Store onboarding: https://learn.microsoft.com/en-us/windows/apps/publish/get-started
- Package a desktop app as MSIX: https://learn.microsoft.com/en-us/windows/msix/package/manual-packaging-desktop-app
- Tauri Windows installer: https://tauri.app/distribute/windows-installer/
- Tauri Store guide: https://tauri.app/distribute/microsoft-store/

## Recommended free path: MSIX (`makeappx.exe`)
For zero certificate cost and zero hosting cost, submit STXIC Halo as a **packaged Desktop Bridge MSIX** (`runFullTrust`) rather than an unpackaged Win32 EXE/MSI:
- **Free Store signing:** Microsoft Partner Center automatically signs `.msix` submissions with the Microsoft Store certificate. (Do **not** upload a self-signed `.msix` to Partner Center.)
- **Free hosting & updates:** Upload the `.msix` directly in Partner Center; Microsoft hosts and updates it via the Microsoft Store.
- **Win32 EXE/MSI alternative:** `npm run desktop:build:store` (`src-tauri/tauri.store.conf.json`) builds offline-WebView2 `nsis` + `msi` installers if you ever distribute outside the Store or pay for Authenticode signing.

## Step-by-step MSIX build & submission
1. **Reserve the app name in Partner Center:**
   - Create an app for **STXIC Halo** in Microsoft Partner Center under **STXIC Labs**.
   - Open **Product management → Product identity** and copy your exact `Package/Identity/Name` and `Package/Identity/Publisher` (`CN=...`).
2. **Build the Store MSIX (`release-output/STXIC-Halo_<version>_x64.msix`):**
   ```powershell
   npm run desktop:build:msix -- -PackageName "<PartnerCenterName>" -Publisher "<PartnerCenterPublisherCN>"
   ```
   *(Pass `-SkipBuild` if `src-tauri/target/release/stxic-halo.exe` is already up to date, or `-TestSign` to create a local self-signed build strictly for local sideloading / Windows App Certification Kit testing.)*
3. **Host the Privacy Policy for free (GitHub Pages):**
   - Publish `docs/release/PRIVACY_POLICY_DRAFT.md` on an HTTPS GitHub Pages URL and enter that URL + `christianlascuna098@gmail.com` in Partner Center.
4. **Partner Center reviewer note (`runFullTrust`):**
   - Note that Halo is a local developer companion that reads local AI coding tool directories (`~/.claude`, `~/.codex`, `~/.copilot`, `~/.gemini`), installs user-triggered hooks, and runs allowlisted verification commands (`git status`, test runners) only in user-approved workspaces.

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
