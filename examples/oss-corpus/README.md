# ClearDOM OSS corpus

The manifest pins 23 immutable open-source revisions: two projects for each source-adapter family, four React Native/Expo projects, and Electron, Tauri, Capacitor, Ionic, and browser-extension surfaces. Each entry narrows scanning to a declared source path and records the license source and review metadata. This metadata is an engineering inventory, not legal advice.

`pnpm test:corpus` uses partial clone plus sparse checkout, scans in a disposable directory, verifies that Git remains clean, and compares every emitted fingerprint with `ground-truth.json`. Scanner output is generated under `.cleardom/corpus-results/` and is never treated as ground truth.

When an intentional scanner change alters fingerprints or findings, run `CLEARDOM_UPDATE_CORPUS=1 pnpm test:corpus` once to refresh generated shadow output, review every changed label, add labels for new findings, and then rerun without the override. The override never updates reviewed ground truth itself. A reviewed false-positive label whose finding disappears remains as immutable regression evidence and is reported as resolved rather than deleted.

Precision is computed from the current finding classification, not the label's historical `detectionClass`: only current `automated` findings enter the numerator or denominator. Downgraded review findings and resolved false positives remain auditable but cannot inflate automated precision.

An unambiguous label may have one documented reviewer. Any disputed blocking label requires agreement from two independent reviewers before it can count toward release evidence.
