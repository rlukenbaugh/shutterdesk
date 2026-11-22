# ShutterDesk — Windows screenshot and screen recorder

ShutterDesk captures the whole screen, a dragged region, or a single window, saves it as a PNG in
`Pictures\ShutterDesk` and copies it to the clipboard. The full edition also records the screen to
`.webm` video.

| Shortcut | Action |
|---|---|
| **Ctrl+Alt+Shift+S** | Capture the screen under the mouse |
| **Ctrl+Alt+Shift+A** | Capture a region (drag; Esc or right-click cancels) |
| **Ctrl+Alt+Shift+R** | Start/stop screen recording (full edition only) |

If another program already uses one of these shortcuts, ShutterDesk says so in its window. The
buttons and the tray menu always work. Closing the window keeps ShutterDesk running in the
notification area (bottom-right of the taskbar) so the shortcuts keep working. Right-click the tray
icon and choose **Quit** to exit.

## Install

There are two editions. Install **one** of them, because both use the same folder and Start menu entry.

### Full edition (recommended): `ShutterDesk-Setup-1.1.0.exe`

Screenshot, region, window and video capture.

- **Easiest:** download `ShutterDesk-Setup` from the latest run of the
  [Build Windows Installer (.exe)](../../actions/workflows/build-windows-exe.yml) workflow and run it.
- **Or build it yourself:** install [Node.js LTS](https://nodejs.org/), then double-click
  `BUILD-WINDOWS-EXE.bat` and run `dist\ShutterDesk-Setup-1.1.0.exe`.

The installer is not code-signed, so Windows SmartScreen shows a warning. Choose
**More info → Run anyway**.

### Native edition: no downloads needed

A small screenshot and region tool (no video), compiled on your PC with the C# compiler that is
part of Windows. Double-click `native-csharp\INSTALL-NATIVE-SHUTTERDESK.bat`.
A classic setup wizard for it, `ShutterDesk-Native-Setup-1.1.0.exe`, is in the `ShutterDesk-Native`
artifact of the same workflow.

### After installing

- Press the **Windows key** and type **ShutterDesk**.
- Program: `%LOCALAPPDATA%\Programs\ShutterDesk\ShutterDesk.exe`
- Start menu shortcut: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\ShutterDesk.lnk`
- Uninstall: **Settings → Apps → Installed apps → ShutterDesk → Uninstall**. Your captures are kept.

### ShutterDesk is installed but not in Start search?

Double-click `Fix-Start-Menu-Shortcut.bat`. It finds `ShutterDesk.exe` (or asks you to drag it in)
and recreates the Start menu shortcut.

## Why it was missing from the Start menu (fixed in 1.1.0)

- **Native edition:** `ShutterDeskNative.cs` did not compile with the C# compiler built into
  Windows. It used C# 6 features that compiler does not have (`?.` and `=>` properties), and
  `"Global\com..."` was an invalid escape sequence for every compiler. The installer script stopped
  at "Compilation failed" before it got to the step that creates the Start menu shortcut, and the
  Fix script then had no `ShutterDesk.exe` to point a shortcut at.
- **Inno Setup script:** it copied from `%LOCALAPPDATA%\...`, but Inno Setup does not expand
  `%VARIABLES%`, so it never compiled either.
- **Full edition:** the corrupt tray icon (below) made the app look like it had quit when its
  window was closed.

The GitHub workflow now installs every edition on a real Windows machine and fails if the Start menu
shortcut is missing or points at a file that does not exist.

## Other changes in 1.1.0

- **App icon:** a camera-aperture icon for the exe, installer, Start menu, taskbar and tray.
  Before, there was no icon, and the tray icon's embedded PNG was corrupt (bad checksum), so the
  tray showed a blank square.
- **New shortcuts: Ctrl+Alt+Shift+S / A / R.** The old Ctrl+Shift+S / A / R were taken over in
  every program while ShutterDesk ran, which broke "Save As" (Ctrl+Shift+S) in many apps and
  Ctrl+Shift+A in browsers and editors.
- **Region capture in the full edition:** the region shortcut used to take a full screenshot. It
  now freezes the screen under the mouse and lets you drag out a region at full resolution.
- **Native edition:**
  - Sharp, complete captures at 125%/150% display scaling (the app is now DPI-aware).
  - Region capture is correct on multi-monitor setups where a screen sits left of or above the
    main one.
  - Region capture works on a frozen picture, so the dim overlay is never in the result.
  - It shows a message when a shortcut is taken by another program.
  - It no longer crashes when another program has the clipboard open.
- **Windows integration:**
  - The window, taskbar button and Start menu shortcut share one app ID, so pinning works properly.
  - The native edition appears in Settings → Apps with a proper uninstaller.
  - Shortcuts land in the right place even when OneDrive has moved your Desktop.
- **Safety:**
  - Windows run with Chromium's sandbox and a content security policy.
  - The page can only save files with a plain name into `Pictures\ShutterDesk`, never an
    arbitrary path.
  - The window cannot navigate away.
- **Usability:**
  - Screens and windows are listed separately, with a "Show in folder" link after each capture.
  - Clear error messages replace silent failures.
  - A one-time tray notice explains where the app went when you close its window.
- **Updated** to Electron 45 and electron-builder 26, with a `package-lock.json` for repeatable builds.

## Develop

```bash
npm install
npm start               # run the full edition
npm run check           # syntax check
npm run dist:win        # build dist\ShutterDesk-Setup-<version>.exe (on Windows)
npm run generate:icons  # redraw assets\icon.ico / icon.png / tray.png
```

`native-csharp\ShutterDeskNative.cs` must stay C# 5 compatible (no `?.`, `=>` members,
`$"..."` strings or `nameof`), because that is all the compiler built into Windows understands.
