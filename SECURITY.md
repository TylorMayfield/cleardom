# Security policy and threat model

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include credentials, private source, screenshots, or customer URLs in a public issue.

## Trust boundaries

- Runtime setup/auth scripts execute with the invoking user's privileges. Review and commit them like application code.
- Runtime URLs, crawled links, response HTML, selectors, filenames, native snapshots, and GitHub content are untrusted input.
- ClearDOM never executes content discovered in a page. Crawling uses safe HTTP navigation and excludes destructive route names by default.
- Automatic edits are scoped source-range changes, checked for stale/overlapping ranges, applied atomically, rescanned, and rolled back when verification fails or introduces a blocking finding.
- GitHub tokens are read only from the environment and are never written to reports or telemetry.
- Native commands target local simulators/emulators. Physical devices and remote/cloud sessions are outside the 1.0 guarantee.
- Telemetry is on by default with environment, configuration, and local opt-outs. Its payload is allowlisted and excludes source, paths, URLs, repositories, Git data, labels, screenshots, configuration and authentication values.

## Release requirements

Every release must pass dependency audit, package-content inspection, malicious-input tests, conformance gates, provenance publishing and checksum generation. A critical vulnerability or credible credential/data leak blocks release.
