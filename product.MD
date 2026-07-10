# ClearDOM Product Vision

## Product promise

ClearDOM helps product teams find and fix meaningful accessibility regressions before they reach users.

It should feel like a trusted engineering teammate: easy to start, careful about what it claims, specific about what to do next, and capable of verifying that a change actually improved the product.

## Vision

Every development team should be able to make accessibility part of its normal delivery workflow without becoming an accessibility tooling expert first.

ClearDOM will make the accessible path the easiest path—from local development through pull-request review—by combining source understanding, rendered-product evidence, safe remediation, and regression protection in one focused workflow.

## Who we serve

### Primary user

The application developer working in an existing React, Next.js, React Native, Expo, or web codebase. They want to ship accessible work but may not know every WCAG criterion, assistive-technology behavior, or testing tool.

They need:

- Useful results on the first run.
- Findings tied to their code and current change.
- Clear guidance without standards jargon.
- Safe fixes and fast verification.
- CI protection that does not make legacy debt block unrelated work.

### Secondary users

- Accessibility specialists who need reliable evidence and honest limits.
- Design-system teams that want accessibility rules encoded once and reused.
- Engineering leads who want regression visibility without noisy CI.
- Coding agents that need structured context, remediation guidance, and verification commands.

## The core product loop

```text
Check → Fix → Verify → Protect
```

1. **Check:** Detect the project and run the most useful source and rendered checks with minimal setup.
2. **Fix:** Offer safe mechanical fixes or a focused agent-ready remediation task.
3. **Verify:** Rescan affected product behavior and report fixed, remaining, and introduced findings.
4. **Protect:** Install pull-request checks that prevent new regressions while keeping existing debt manageable.

The primary command experience should remain small:

```sh
cleardom check
cleardom fix --apply
cleardom install
```

Advanced capabilities may exist, but they should support this loop rather than compete with it.

## Product principles

### 1. Simple by default

The first run should require no configuration in a conventional project. ClearDOM should detect the stack, choose sensible behavior, and explain any capability it could not run.

New top-level commands are a cost. Prefer extending the core loop, automatic detection, or an advanced option before adding another command.

### 2. Signal over coverage

A smaller set of findings that developers trust is more valuable than a larger catalog they ignore.

Default findings should have a clear user impact, useful confidence level, concrete location, and next action. Low-confidence or contextual checks must be visibly distinguished from automated failures.

### 3. Fix outcomes, not just code patterns

Detection is only the beginning. ClearDOM should help the user reach a verified improvement and clearly report what remains.

Automatic edits must be conservative, reviewable, and followed by verification. When intent cannot be preserved mechanically, ClearDOM should guide a developer or coding agent instead of guessing.

### 4. Prevent regressions without punishing adoption

Teams should be able to adopt ClearDOM in imperfect, long-lived products. Existing debt should remain visible, while changed-file checks and baselines prevent new problems from being introduced.

### 5. Be honest about accessibility

ClearDOM provides automated guidance; it does not certify legal or WCAG conformance and does not replace testing with disabled users or assistive technologies.

Every rule should communicate whether it is automated, needs review, or provides manual guidance. Reports must not turn a score into a compliance claim.

### 6. Meet developers where they work

Local CLI output, changed files, pull requests, design systems, rendered routes, Storybook, and coding agents are all parts of one workflow. Integrations should reduce context switching and preserve a consistent finding identity across surfaces.

### 7. Stay dependency-conscious

The source scanner should remain fast and lightweight. Heavier browser or simulator capabilities should be used when they materially improve evidence and should fail gracefully when unavailable.

## What makes ClearDOM different

ClearDOM is not only a linter and not only a browser audit. Its advantage is the connection between:

- Compiler-aware and framework-aware source analysis.
- Rendered CSS, focus, keyboard, viewport, and interaction evidence.
- Design-system component semantics.
- Safe and agent-assisted remediation.
- Verification after edits.
- Regression-focused pull-request review.
- Web and React Native developer workflows.

We should deepen these connections before expanding into unrelated product categories.

## Product boundaries

### We are building

- A developer-first accessibility regression workflow.
- High-confidence source and rendered checks.
- Clear, evidence-backed remediation.
- Safe fixes with automatic verification.
- Low-friction pull-request protection.
- Honest support for review-only and manual testing needs.
- Extensibility for design systems, frameworks, routes, and coding agents.

### We are not building

- A legal compliance certification product.
- A replacement for manual audits or testing with disabled users.
- A generic code-quality platform.
- A dashboard that exists without a clear developer action.
- A rule-count competition with established accessibility engines.
- Destructive or speculative automatic code rewriting.
- A separate workflow for every framework when detection and shared conventions will work.

## Experience standards

A successful first-time experience should:

1. Start from `cleardom check` or simply `cleardom`.
2. Detect the project without asking setup questions.
3. Complete source checks even if rendered checks are unavailable.
4. State what ran, what did not run, and why.
5. Show a small number of prioritized findings.
6. Recommend one clear next action in the same product loop.
7. Preserve the target path and context in every suggested command.

A successful fix experience should:

1. Preview or apply only changes ClearDOM can make safely.
2. Group related findings into a manageable batch.
3. Verify the result automatically after applying changes.
4. Report fixed, remaining, and introduced findings.
5. Hand unresolved work to a developer or coding agent with enough context to act.

## How we measure success

### North-star outcome

The percentage of newly introduced, actionable ClearDOM findings that are fixed and verified before merge.

### Activation

- Percentage of first runs that complete without configuration.
- Percentage of supported web projects that complete source and rendered checks from `cleardom check`.
- Time from installation to the first useful finding.

### Trust and quality

- Accepted-finding rate versus suppression or dismissal rate.
- False-positive reports per rule and framework.
- Percentage of default findings with high confidence and a concrete remediation.
- Runtime scan reliability and graceful-fallback rate.

### Resolution

- Percentage of high-confidence findings safely fixed or converted into an actionable agent task.
- Percentage of applied fix batches that verify with no introduced findings.
- Median time from finding to verified resolution.

### Retention

- Percentage of activated projects that install pull-request protection.
- Weekly projects using changed-file or PR checks.
- Regression prevention rate after installation.

Scores, total rule count, and raw finding volume are diagnostic metrics—not measures of product success.

## Decision rubric

Before building a feature, answer these questions:

1. Does it strengthen **Check, Fix, Verify, or Protect**?
2. Does it reduce the time or expertise required to reach a verified outcome?
3. Will it improve signal quality, evidence, or trust?
4. Can it fit the existing three-command experience?
5. Does it work across multiple supported stacks, or is the stack-specific value unusually high?
6. Can we test it with realistic fixtures and clear acceptance criteria?
7. Does it preserve honest boundaries around automated accessibility testing?

Prefer work that receives strong answers to the first four questions. A feature that adds breadth but increases setup, noise, or command complexity should normally be deferred.

## Current strategic priorities

1. Make `cleardom check` reliably deliver source and rendered evidence with zero configuration across supported stacks.
2. Increase the share of findings that can reach a safe, automatically verified resolution.
3. Improve signal quality using framework, design-system, route, and change context.
4. Make pull-request protection the natural final step of local adoption.
5. Measure activation, trust, resolution, and regression prevention before expanding the product surface.

## Maintaining this document

This document is the product decision reference, not a release roadmap. Review it when proposing a major feature, adding a top-level command, changing default rule behavior, or expanding into a new user or platform.

Update it only when the product strategy changes. Implementation details, release plans, and temporary priorities belong in issues or planning documents.
