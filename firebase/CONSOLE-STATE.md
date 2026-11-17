# Firebase state inventory — 17 November 2026

Project `on-air-df94e`. Current console review was blocked by a signed-out Google
session. No deployed backend state was changed during this handoff.

| Surface | Saved evidence | Current verification / source status |
| --- | --- | --- |
| Firestore security rules | Historical combined avatar/chat/update rules; 0.10.34 narrow `appControl/stable` fragment with saved deployment verification | Current full deployed ruleset not exported; reconstructed candidate is not certified live |
| Composite indexes | One `chatRooms` collection index: `members CONTAINS`, `lastAt DESCENDING` | Historical JSON recovered; current deployed indexes/exemptions unknown |
| `appControl/stable` | Schema 1; minimum code 91; `portalPaused=false` last recorded on 5 November | Live document values and subsequent changes unknown; runtime owner-managed data, not a Git-configured switch |
| `appUpdates/stable` | Last recorded verified public update was 0.10.34 / code 91 | Live value not re-read; publishing metadata is console/admin-managed, not implied by a Git commit |
| Authentication | Anonymous sign-in enabled and used by updater/control in prior verification | Current provider configuration, authorized domains, quotas and abuse policy unknown; not encoded by these rule files |
| IAM / publisher authority | Historical owner console / short-lived Cloud Shell authorization | Current members, roles, service-account inventory and keys unknown; no credential exported |
| App Check | No token integration observed in the inspected 0.10.34 updater/control HTTP path | Current registration/enforcement unknown; enabling it without compatible clients can block update/control reads |
| Google API restrictions | Android Firebase client configuration existed in historical app resources and generated config | Current API/application restrictions unknown; key values omitted from handoff source |
| Storage rules / buckets | Historical bucket identifier and old Firebase client configuration | No current Storage rules export recovered; access/lifecycle/CORS unknown |
| Cloud Functions | No Functions source, package manifest or deployment configuration found in recovered On Air archives | Deployed function inventory unknown; cannot certify none exist |
| Hosting | Historical publisher scripts describe older hosting workflows; current APK download channel is GitHub Releases | Current sites, rewrites, custom domains and deployed hosting config unknown |
| Billing, budgets, quotas, alerts, logs | No current authenticated export | Console/Cloud settings not represented in the recovered files |
| Legacy avatar/chat data | Historical rule files still contain grants for these retired app features | Current retained data and deployed grants unknown; do not reactivate from an old rule copy without review |

`firestore.rules` merges the exact saved historical rules with the saved control
fragment before the catch-all deny. `firestore.indexes.json` is copied from the
historical project. The root `firebase.json` was newly added for an explicit
reviewable CLI file mapping; it does not establish current deployed state and
does not contain a default project alias. Nothing here deploys automatically.

Before a backend change, export current rules/releases and indexes, inspect
Functions/Storage/Hosting and the settings above, compare against these saved
records, and validate permissions with the emulator. App identities must not
gain administrator/publisher rights. Never put credentials in this repository.
