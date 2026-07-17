export const helpText = `ClearDOM finds and fixes accessibility regressions before they ship.

Usage:
  cleardom [path|url]                  Run the complete check
  cleardom check [path|url] [--diff]  Check source and the rendered app
  cleardom fix [path] [--apply|--json] Fix findings, emit an agent task, or verify
  cleardom install                    Add pull-request protection

Common options:
  --diff                              Check changed files only
  --source-only                       Skip rendered browser checks
  --format text|json|sarif|html       Choose output format
  --verbose                           Show every finding and diagnostic

Run cleardom help --all for compatibility and advanced commands.
`;

export const advancedHelpText = `${helpText}
Advanced and compatibility commands:
  cleardom scan [path|url] [options]
  cleardom ci [path] [options]
  cleardom review [path] [--dry-run] [--max-comments 20]
  cleardom github-pr [path]             Deprecated alias for review (kept through 1.x)
  cleardom init [--dry-run] [--target path] [--create-baseline] [--install-ci]
  cleardom doctor [path]
  cleardom report [path|url] [--format html|markdown|json] [--output file]
  cleardom suppress [path] [--rule rule-id] [--file file] [--limit count]
  cleardom baseline update|prune [path]
  cleardom browser install
  cleardom native scan [path]
  cleardom telemetry enable|disable|status|reset
  cleardom agents detect|install|uninstall|upgrade
  cleardom explain rule-id
  cleardom rules
  cleardom standards
`;

export function help(all = false): void {
  console.log(all ? advancedHelpText : helpText);
}
