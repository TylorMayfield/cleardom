# ClearDOM WCAG Rule Documentation

This document outlines the accessibility checks performed by ClearDOM, correlating rule codes with their descriptions and how they are controlled via the configuration file (`cleardom.config.json`).

## Overview
ClearDOM performs static analysis of code (React/Next.js/etc.) to detect common accessibility violations based on WCAG guidelines. The enablement status for each check is determined by the `rules` section in `cleardom.config.json`.

## Detected Rules

The following table lists all rules identified within the codebase. The status (`Status`) indicates whether the rule is currently enabled/checked according to the configuration, and its associated severity level.

| Rule Code | Description | Status (Based on Config) | Severity Example |
| :--- | :--- | :--- | :--- |
| `CDOM001` | interactive control has no accessible name | *[Check config for status]* | Critical |
| `CDOM002` | React Native touch control has no accessibility label | *[Check config for status]* | N/A |
| `CDOM003` | interactive label is ambiguous | *[Check config for status]* | N/A |
| `CDOM004` | input relies on placeholder text as its label | *[Check config for status]* | N/A |
| `CDOM005` | image has no useful alternative text | *[Check config for status]* | N/A |
| `CDOM006` | anchor is missing an href | *[Check config for status]* | N/A |
| `CDOM007` | clickable non-interactive element lacks keyboard support | *[Check config for status]* | N/A |
| `CDOM008` | heading level jumps | *[Check config for status]* | N/A |
| `CDOM009` | React Native touch control has no accessibility role | *[Check config for status]* | N/A |
| `CDOM010` | form control has no accessible label | *[Check config for status]* | N/A |
| `CDOM011` | document language or title is missing | *[Check config for status]* | N/A |
| `CDOM012` | personal information input is missing autocomplete | *[Check config for status]* | N/A |
| `CDOM013` | accessible name does not include visible label | *[Check config for status]* | N/A |
| `CDOM014` | status message is not exposed as a live region | *[Check config for status]* | N/A |
| `CDOM015` | media is missing an obvious text alternative | *[Check config for status]* | N/A |
| `CDOM016` | focusable content is hidden from assistive technology | *[Check config for status]* | N/A |
| `CDOM017` | duplicate id values can break accessibility references | *[Check config for status]* | N/A |
| `CDOM018` | positive tabIndex changes the natural focus order | *[Check config for status]* | N/A |
| `CDOM019` | grouped form controls are missing a legend | *[Check config for status]* | N/A |
| `CDOM020` | invalid form control is not connected to error text | *[Check config for status]* | N/A |
| `CDOM021` | pointer action may fire before cancellation is possible | *[Check config for status]* | N/A |
| `CDOM022` | text contrast is below the minimum ratio | *[Check config for status]* | N/A |
| `CDOM023` | focused control has no visible focus indicator | *[Check config for status]* | N/A |
| `CDOM024` | interactive target is smaller than WCAG minimum | *[Check config for status]* | N/A |
| `CDOM025` | page causes horizontal overflow at narrow viewport | *[Check config for status]* | N/A |

## Configuration Control
Rule enablement and severity are controlled by the `rules` section in `cleardom.config.json`. To enable a rule, it must be defined with `{ "enabled": true, "severity": "LEVEL" }`, where `LEVEL` can be `"critical"`, `"warning"`, `"info"`, or `"off"`.

**Example Configuration Snippet:**
```json
"rules": {
  "CDOM001": { "enabled": true, "severity": "critical" },
  "CDOM022": { "enabled": false } // Disables contrast checks for this run
}
```

## Current Checked Rules
To determine which rules are actively checked for a given scan, review the `rules` section of your project's `cleardom.config.json`. Rules with `"enabled": true` will be active in the scan.

***
*Disclaimer: This documentation is based on the known checks implemented in ClearDOM and how they interact with configuration files. The complete set of all possible WCAG rules is defined by the underlying library, but only those explicitly configured to be enabled will be reported.*