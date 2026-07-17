# ClearDOM 1.0 release gates

The canonical machine-readable thresholds live in `release-gates.json`; `pnpm release:gates` evaluates available evidence. A missing corpus, native run, GA4 secret, platform result, evidence fragment, or reviewed sample is a failing gate, never an implicit pass.

Beta evidence is required per stack, including a unique, stack-owned runnable clean app, a unique broken app, a case manifest, source plus runtime/native completion, fix verification, and protection verification. Shared snippets and reused generic demo roots do not satisfy this gate. RC and final evidence additionally require at least 95% observed precision and 20 current reviewed automated findings for every default-blocking rule; an aggregate precision number cannot hide a weak or unsampled rule. Corpus entries pin a commit and license review, point to separately reviewed ground truth, and must declare shadow mode.

Prereleases advance in order: alpha after contract and runner stability, beta after conformance, release candidate after corpus/security/performance evidence, and 1.0 only when every mandatory gate passes on the same commit.

The OSS corpus manifest records repository, full commit SHA, reviewed license source, adapter family, platform, and a narrow scan target. Ground truth is commit-bound and stored separately from scanner output. Unambiguous labels require a documented reviewer; disputed blocking labels require two independent reviewers. Corpus scans use sparse disposable checkouts, assert a clean Git status, and never apply fixes upstream. An empty corpus is a CI failure, not a successful no-op.

`pnpm test:corpus` writes a commit-bound precision fragment under `.cleardom/evidence/`. Resolved false-positive labels remain in ground truth as historical regression evidence; only findings whose current detection mode is `automated` contribute to precision. `pnpm evidence:assemble` rejects missing categories, mixed commits, duplicate values, and secret-like fields before writing `.cleardom/release-evidence.json`. The final gate independently recomputes corpus counts and cross-checks the assembled values.

Source and rendered conformance jobs write their own fragments. Device, performance, fix-safety, security, platform, supply-chain, and release-history jobs record their measured JSON with `pnpm evidence:record -- <category> <values.json>`; the command binds it to the current commit and refuses categories owned by automated corpus/conformance jobs. External attestations must contain results only, never credentials or the GA4 secret.
