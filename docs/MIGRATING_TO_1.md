# Migrating from ClearDOM 0.2 to 1.x

1. Use Node.js 22.12 or newer.
2. Add `"schemaVersion": 1` and `"$schema": "https://unpkg.com/cleardom@1/cleardom.schema.json"` to `cleardom.config.json`.
3. Replace native EAS configuration with the local runner:

```json
{
  "native": {
    "enabled": true,
    "runner": "local",
    "platforms": ["ios", "android"],
    "appIds": {
      "ios": "com.example.app",
      "android": "com.example.app"
    }
  }
}
```

A legacy `native.appId` is migrated in memory only when exactly one platform is configured. `native.provider: "eas"` is rejected with recovery guidance.

JSON scan, comparison, fix and remediation payloads now carry `schemaVersion: 1` and a stable `kind`. Default failure gates include only high-confidence automated findings. Promote a reviewed rule explicitly with `"blocking": true` in its rule configuration.

Generated GitHub workflows use `cleardom@1`, Node 22.12, and commit-pinned actions.
