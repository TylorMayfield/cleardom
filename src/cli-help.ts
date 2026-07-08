export const helpText = `ClearDOM finds accessibility, readability, and assistive-tech regressions before they ship.

Usage:
  cleardom [path|url] [--diff] [--format text|json|sarif|html]
  cleardom install [--yes] [--agents] [--github-actions] [--agent codex|claude|cursor]
  cleardom init [--dry-run] [--yes] [--target path] [--create-baseline] [--ci-dry-run] [--install-ci]
  cleardom scan [path|url] [--diff] [--format text|json|sarif|html] [--include-rules] [--semantic auto|off|required] [--runtime-url http://localhost:3000] [--baseline cleardom-baseline.json] [--write-baseline cleardom-baseline.json]
  cleardom ci [path] [--format text|json|sarif|html] [--include-rules] [--baseline cleardom-baseline.json]
  cleardom doctor [path] [--config cleardom.config.json] [--runtime-url http://localhost:3000]
  cleardom report [path|url] [--format html|markdown|json] [--output cleardom-report.html]
  cleardom review [path] [--dry-run] [--max-comments 20] [--severity-threshold critical|warning|info] [--comment-mode off|summary|inline|both] [--changed-files-only] [--baseline-policy new|all] [--status-check-name "ClearDOM PR review"] [--upload-sarif]
  cleardom suppress [path] [--rule CDOM_4_1_2_UNNAMED_CONTROL] [--file src/App.tsx] [--limit 1] [--baseline cleardom-baseline.json]
  cleardom baseline update|prune [path] [--baseline cleardom-baseline.json]
  cleardom browser install
  cleardom native scan [path] [--format text|json|sarif|html] [--include-rules]
  cleardom agents detect|install|uninstall|upgrade [--agent codex|claude|cursor]
  cleardom explain CDOM_4_1_2_UNNAMED_CONTROL
  cleardom rules
  cleardom standards
  cleardom fix [path] [--preview] [--apply] [--plan --format text|json|markdown] [--agent codex|claude|cursor] [--rule CDOM_4_1_2_UNNAMED_CONTROL] [--file src/App.tsx] [--limit 1]
`;

export function help(): void {
  console.log(helpText);
}
