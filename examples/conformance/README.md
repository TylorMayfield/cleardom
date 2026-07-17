# ClearDOM conformance applications

`pnpm conformance:generate` reproducibly creates one stack-owned clean and broken application for every GA stack. Do not hand-edit `apps/`; change `scripts/generate-conformance-apps.mjs` and regenerate it.

`pnpm test:conformance` validates package start commands, case manifests, compiler-backed source adapters, clean blocking results, and expected broken findings. `pnpm test:conformance:runtime` starts and audits all 36 web surfaces through ClearDOM's browser engine. React Native and Expo runtime evidence is collected by the separate iOS Simulator and Android Emulator release jobs.
