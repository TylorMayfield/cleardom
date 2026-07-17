# ClearDOM 1.x public contracts

ClearDOM 1.x keeps the `check`, `scan`, `ci`, `fix`, `install`, `review`, `github-pr`, `doctor`, `report`, `suppress`, `baseline`, `browser`, `native`, `agents`, `rules`, `explain`, and `standards` command families. `github-pr` is a deprecated compatibility alias for `review`; it remains available through 1.x.

Configuration uses `schemaVersion: 1` and editor completion through `cleardom.schema.json`. JSON scan, comparison, fix, agent-remediation, and SARIF run contracts carry `schemaVersion: 1` plus a stable `kind`. Unknown configuration keys are errors. Run `cleardom doctor .` after migrating from 0.2; see `MIGRATING_TO_1.md` for native identifier migration.

Finding contracts include a stable rule ID and fingerprint, severity, immutable detection mode, confidence and explanation, impact, blocking status, evidence source, fix classification, standards mapping, source location, and any rendered/native occurrences. WCAG mappings describe relevance; they do not claim automated coverage.

Every default-blocking catalog rule is listed in `rule-trust.json` with positive, negative, adversarial, and framework cases, an explicit proof boundary, and a verification procedure. Release gates reject drift between that manifest and the executable rule catalog.

Exit codes are stable for 1.x:

- `0`: command completed and its configured gate passed.
- `1`: a configured high-confidence automated finding/regression gate failed, or a fix introduced a blocking finding.
- `2`: invalid input/configuration, unavailable required setup, incomplete fix verification, or an operational/internal error.

Browser or native coverage may degrade without failing an otherwise source-only scan. Machine-readable `outcome` and structured diagnostics always identify attempted/completed coverage and provide recovery guidance.
