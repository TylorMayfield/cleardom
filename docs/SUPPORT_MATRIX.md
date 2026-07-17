# ClearDOM 1.x support contract

ClearDOM 1.x treats every stack below as generally available, with an explicit capability contract. GA means the declared checks complete or ClearDOM emits a structured diagnostic with a recovery command; it does not mean every stack has identical source semantics.

| Stack | Source evidence | Rendered/device evidence | GA boundary |
| --- | --- | --- | --- |
| React, Next.js, Remix, Gatsby, Vite React, Preact, Solid | TypeScript compiler-backed JSX/TSX semantics | Chromium routes, viewports, interactions, CSS and ARIA | Dynamic values that cannot be resolved statically are verified only when rendered. |
| HTML | HTML-like source adapter | Chromium | Server-only templates require a rendered URL. |
| Vue, Svelte, Astro, Angular | Framework template adapter with import provenance; project compiler use is reported when available | Chromium | Lightweight fallback findings are review-only unless validated for that adapter. |
| MDX | Authored markup and import provenance; fenced examples excluded | Chromium through the host app | Generated prose semantics remain the host application's responsibility. |
| Electron | Renderer source and static `loadFile` or renderer dev server | Chromium-compatible renderer evidence | Main/preload Node APIs are outside accessibility evaluation. |
| Tauri, Capacitor, Ionic | Web source and configured renderer entry point | Chromium against the authored web surface | OS chrome and opaque embedded webviews require manual testing. |
| Browser extensions | Authored source, popup/options HTML when discoverable | Configured popup/options targets | Browser-owned UI and packaged-only pages require explicit entry points. |
| React Native, Expo | TypeScript compiler-backed React Native semantics | Local iOS Simulator and Android Emulator accessibility trees | Physical devices, VoiceOver, TalkBack, switch control and magnification remain manual/preview. |

Unknown web stacks can always use HTML/source scanning plus an explicit runtime URL. ClearDOM reports `semanticAnalysis`, fallback counts, runtime diagnostics and native diagnostics in every machine-readable result.

ClearDOM provides automated guidance, not legal certification. Assistive-technology testing and testing with disabled users remain necessary.
