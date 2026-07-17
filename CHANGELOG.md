# Changelog

## 1.0.0-alpha.1 - Unreleased

ClearDOM 1.0 is gated by measured conformance, precision, completion, fix-safety, performance, security, accessibility, and cross-platform evidence. It is not released while `pnpm release:gates` fails.

This first alpha establishes the stable scanner/native/evidence contracts and the stage-aware release pipeline. It intentionally does not claim beta or release-candidate readiness: GA4 configuration, independent holdout precision, real-device conformance, performance, security, platform, and supply-chain measurements remain later-stage gates.

### Added

- Schema-versioned configuration and scan, comparison, SARIF, fix, and agent contracts.
- Explicit automated, needs-review, and manual-guidance trust classes with blocking limited to high-confidence automated evidence.
- Local iOS Simulator and Android Emulator evidence through pinned `agent-device` structured accessibility trees.
- Atomic safe transforms with rescan verification and automatic rollback.
- Major-pinned pull-request protection, fork-safe checks, stale-comment cleanup, and commit-pinned actions.
- GA4 measurement with a strict privacy allowlist and local identifier controls.
- Stage-aware alpha, beta, release-candidate, and final evidence gates.

### Changed

- Node.js 22.12 or newer is required.
- Native application IDs are platform-specific.
- WCAG mappings are reported separately from automated coverage.
- Anonymous product telemetry defaults on; environment, local, and project opt-outs remain supported.

### Removed

- EAS is no longer a native execution provider. Cloud and guaranteed physical-device execution are outside the 1.0 contract.

See `docs/MIGRATING_TO_1.md` for migration steps.
