# On Air developer handoff

Verified 17 November 2026. Package: `ae.onair.schedule`. Requested handoff target:
**0.10.38 / versionCode 95**. Read this before building or deploying anything.

## Repository, branch and completeness

- Repository: https://github.com/antiantantidote-ux/on-air-releases
- Documentation branch: `handoff/0.10.38`. The full recovered tree is supplied
  privately as `On-Air-v0.10.38-developer-handoff-2026-11-17.zip`.
- Automatic approval review blocked the broad public source upload because it
  included historical and decompiled code. No full source commit was created.
  Full public source publication remains pending explicit approval.
- At inspection, `main` was the original README-only commit
  `cd350fc439abf35514d02f520da391fe8afe465d`. It did not contain application source.
- The other existing branch, `claude/el-dios-presidente-game-4nt4ah`, is a different
  game project, not On Air. It was not changed for this handoff.
- Latest public release observed: **0.10.34 / 91**. The published 0.10.34 APK has
  SHA-256 `ce91db8a0bdfd2ce72c087332315a2986a0b7ffdb4b0a2468e23603181df04c1`.
- 0.10.35–0.10.38 were private login/navigation tests. 0.10.39 / 96 is the later
  private Flighty-inspired saved-agenda layout experiment. Its implementation is
  preserved under `overlays/v0.10.39`; it is not silently promoted to stable.

**There is no recovered complete, authoritative, current Gradle production
source tree.** The private handoff package contains the recoverable sources and production
patch inputs/scripts, not a claim that `assembleRelease` rebuilds 0.10.38 from
readable source alone. The recovered app code is **Java and JavaScript**, not
Kotlin. Kotlin libraries in dependencies do not imply missing `.kt` files.

The readable 0.10.26 development snapshot predates 0.10.27's restored in-app
updater. Subsequent production builds deliberately patched exact signed APKs
to preserve that updater and other current behavior. The latest recovered
whole-project regression fixture incorporates selected later feature mirrors,
but is still not the complete production app. A normal whole-app release needs
the missing production source recovered or reconstructed and validated first.

## Where to start

Paths in the table and build instructions below refer to the private handoff
package. The public documentation branch contains this handoff and the console
state inventory; it does not contain the full recovered source tree.

| Path | Purpose and authority |
| --- | --- |
| `overlays/v0.10.38/` | Target production navigation overlay, readable `PortalReturn`, patch scripts, native adapters, Android/JS tests and recorded evidence |
| `overlays/v0.10.37/` | Latest preceding login/location/CAPTCHA overlay |
| `overlays/v0.10.34/control-src/` | Owner-control implementation: policy, HTTP transport, foreground lifecycle and native bridge |
| `overlays/v0.10.28`–`v0.10.33` | Hours, login-budget, foreground map-cancellation, local Plus Code and venue/studio changes |
| `overlays/v0.10.39/` | Later private local-agenda UI experiment; separate from the 0.10.38 target |
| `reference/gradle-fixture/` | Latest recovered readable Java/Gradle regression fixture, app assets and Android resources; **never distribute its APK** |
| `firebase/` | Last-recorded reconstructed rules/index candidate, historical versions and console-state inventory |
| `recovery/` | Archive hashes, per-file provenance, exact required APK input hashes and damaged-archive disclosure |

`compile-only/`, `test-project/fixtures/` and inspection/decompiled files are
adapters or test aids. They must never replace real production classes in an
APK. Each overlay's build script limits which compiled classes enter DEX.
Repeated pinned tool paths are retained because the original scripts address
them; Git stores identical blobs only once.

## Architecture

The foreground Android `MainActivity` hosts the authenticated ScheduAll portal
in a WebView. The readable fixture shows the original named classes; production
uses R8-obfuscated classes, addressed explicitly by the overlay adapters and
verified smali insertion points. Do not infer production class names from a
fixture alone.

The portal classifier recognizes login, schedule and work-order documents.
Page-origin, main-frame, page-generation, nonce and saved-account revision
checks reject stale/untrusted bridge callbacks. `PortalRules` and the newer
native gate restrict portal navigation. SSL failures cancel rather than
proceeding through certificate errors.

Saved schedule data drives the native agenda, weekly/monthly plans, widgets,
booking details, map destinations and hours. Data is scoped to the saved
account; account replacement/reset must invalidate session/capture callbacks
and caches. `HoursCalculator` uses the first start to last finish per day,
ignoring LOC; corrections, holidays and compensation are separate policies.
The 0.10.28 patch fixes AM/PM remarks being consumed as clock suffixes.

Map links retain their captured destination, with local venue/WO pin overrides.
The Plus Code UI and venue/studio illustrations are local features. Short-map
link resolution uses the foreground connection guard. Widget refresh does not
authorize an employer-portal fetch.

The in-app updater and owner-control HTTP use a separate Firebase anonymous
identity, not ScheduAll credentials or cookies. Release metadata describes a
versioned GitHub APK. Download validation checks HTTPS/allowed hosts, package,
version, size, hash and the existing signing certificate before handing off to
Android's user-approved installer.

## ScheduAll login, CAPTCHA, location and capture

1. The user opens On Air. Live portal access requires the exact activity to be
   resumed and a fresh owner-control permission lease. Saved/offline views are
   usable when live access is blocked.
2. `SecretStore` keeps the password encrypted with an Android Keystore AES-GCM
   key. The username and encrypted record are local. Normal WebView cookies
   remain subject to the server's session expiry and revocation.
3. Bundled prefill scripts fill one visible trusted login form and fire its
   normal validation events. Manual edits, foreign/ambiguous forms and stale
   pages must not be overwritten.
4. Bundled ML Kit OCR reads the existing CAPTCHA locally. Consensus and image
   identity/ticket checks guard filling and the ordinary Sign in click. No
   external CAPTCHA-solving service is part of this implementation.
5. Genuine platform/portal GPS is required. The Samsung routine turning Location
   on is not itself a coordinate fix or location permission. The latest helper
   reuses only an eligible genuine fix up to 60 seconds old; it does not invent
   coordinates or bypass campus restrictions.
6. The persisted automatic submission budget is **six total submissions**.
   Another automatic submission requires an explicit CAPTCHA rejection and a
   changed challenge. Uncertain responses, credential/access/rate-limit stops,
   manual edits and foreground loss stop automation. Reopening is not permission
   to reset a used budget. CAPTCHA image refresh is separately bounded to two
   extra image requests in 120 seconds; local image reads are not submissions.
7. After authenticated schedule classification, capture scripts read the
   rendered visible schedule/contacts, not hidden credentials or arbitrary
   server state. They normalize supported dates/digits, associate map links
   with the correct WO and preserve incomplete/missing-day information. Native
   handlers recheck identity/page generation before accepting the snapshot.

Employer authorization, GPS policy, CAPTCHA and rate limits still apply. Six
attempts are not an assurance that ADM will accept that retry policy. Real
CAPTCHA accuracy and portal response time were not established by fixture tests.

## Foreground policy and owner stop switch

`ForegroundNetwork` owns tracked native connections for the current resumed
interval. Pause invalidates work, disconnects tracked portal connections, cancels
login/location/OCR callbacks, blocks WebView and service-worker network loads,
stops loading/timers and blanks live portal documents. Requests already received
by a server cannot be recalled. No hourly employer polling job is intended in
current builds; startup cancels the legacy jobs from older installed versions.

`appControl/stable` is checked while an app activity is resumed: one request at
a time, normally every 60 seconds, a 12-second overall deadline and 75-second
permission lease. Missing, malformed, expired or unreachable control status
blocks live portal access. `portalPaused=true` pauses it. Only gate-compatible
installations (0.10.34+) obey it; it cannot stop older APKs that lack the code.
Fields are `schemaVersion` (1), `minimumVersionCode`, `portalPaused`, and optional
bounded `message`. Administrators write through console/IAM; app clients only get
the document. No admin identity or key belongs in the app.

## What "navigation-test" (0.10.38) was for

The reported bug was Back from Weekly plan, Monthly plan or Settings revealing
the login page or apparently logging out. `PortalReturn` closes the local panel
and reveals the retained portal. It remembers a classifier-verified, read-only
schedule URL in memory, tied to the exact WebView/account revision.

If pause blanked the live page, return may issue **one foreground GET** to that
verified schedule URL with the existing session, after owner permission. It does
not replay credentials, refresh a CAPTCHA, walk blindly back into login history,
replay a POST or extend the server session. Account reset, replacement WebView
and destruction invalidate the remembered route. A revoked/expired session or
lost process still needs normal sign-in. The test was never published as stable.

## Building and signing

**No existing GitHub Actions APK build/signing workflow was found.** Neither
inspected branch contains an On Air workflow. No existing workflow references
signing secrets. The connected API does not expose the stored Actions-secret
inventory, so this is not a claim that unused repository/organization secrets
do not exist. There are no verified existing secret names to hand over.

Builds were produced in a private workspace using Python, JDK/javac, Android
SDK/build-tools 35.0.0, D8, checksum-pinned smali/baksmali, zipalign and apksigner.
The whole-project fixture uses AGP 8.6.1, Gradle 8.7, Java 8 target compatibility,
SDK 35 and minSdk 26; API36 Robolectric checks require JDK21. Later overlays
compile only selected helpers, merge verified smali deltas into the exact base
DEX, update manifest/controller versions, preserve other entries, align, sign
and verify. Signing/ZIP metadata can differ across toolchains.

For 0.10.38, from `overlays/v0.10.38`:

1. The private handoff package includes the exact
   `inputs/On-Air-v0.10.37-login-test.apk` for this overlay and the 0.10.38
   input for the later layout experiment. These APKs stay out of Git.
   `recovery/required-apk-inputs.json` records the required hashes.
   Run `tools/restore_inputs.py` from the repository root to install matching
   separately supplied APKs. APKs and signing keys are deliberately not in Git.
2. Bootstrap official pinned dependencies with
   `ONAIR_BUILD_HOME="$PWD/toolchain" python3 baseline-v35/baseline-source/project/baseline-source/project/tools/private-build/bootstrap.py`.
3. Privately supply `ONAIR_KEYSTORE_PATH` and `ONAIR_KEYSTORE_PASSWORD`.
   `ONAIR_KEY_ALIAS` and `ONAIR_KEY_PASSWORD` can select the corresponding alias
   and separate key password. These are environment-variable names introduced
   for the sanitized handoff, **not confirmed GitHub Actions secrets**.
4. Run `npm ci --prefix test-deps --no-audit --no-fund`, then
   `node --test tests/login-location.test.cjs` and
   `ONAIR_BUILD_HOME="$PWD/toolchain" python3 test-project/tools/run.py testDebugUnitTest`.
5. Run `python3 build_navigation.py`, then `python3 verify_navigation.py`.
   The script enforces base hash, changed-class boundary, package/version,
   unchanged assets/resources/libraries and original signer.
6. `package_navigation.py` expects the recorded 132 Android / 41 JS results and
   packages private outputs. Do not commit its generated APK or private inputs.

`tools/verify_handoff.py` checks the committed source/provenance and credential
exclusions without using employer or Firebase accounts. No APK is rebuilt or
published merely by cloning or pushing this branch.

### Original keystore custody

The historical Gradle project called its local key `development.keystore`.
A separately saved **`TVBookings-signing-backup.keystore`** exists in the owner's
ChatGPT files (2,730 bytes). Thus a copy exists **outside GitHub secrets**. Its
bytes/password are not in this branch or handoff text. Historical private build
paths included `inputs/private/TVBookings-signing-backup.keystore` and
`private-inputs/TVBookings-signing-backup.keystore`; transient workspace copies
are not a durable backup. Additional copies on the owner's own devices are
unknown. Arrange a private transfer to the successor; never add the key to Git.

Expected public signing-certificate SHA-256:
`8223a62cf698b008728ecb5b843c69d427ef9877bd16c84867bee385593d3647`.
This public fingerprint is not the private key. Retain signer continuity for
updates. Legacy inline signing parameters were removed from recovered scripts;
the handoff requires private environment inputs instead.

### Publication

The established flow was privately build/sign/verify, upload a versioned GitHub
release APK, independently verify the public bytes, then atomically write and
read back Firebase `appUpdates/stable`. The historical guarded publisher is in
`firebase/historical/publish.py`; it uses the owner's short-lived Cloud Shell
authorization, not an embedded admin credential. Update metadata is separate
from `appControl/stable`. Do not overwrite an existing version's binary or
publish this source fixture as an update. This handoff changes neither document
and publishes no APK.

## Firebase and console-only state

Project identifier: `on-air-df94e`. See `firebase/CONSOLE-STATE.md` for a complete
inventory of verified historical records versus current unknowns. Firebase was
signed out during this handoff and its optional integration was not connected.
**Current deployed rules/settings cannot be certified.**

`firebase/firestore.rules` is a reconstructed **last-recorded** candidate:
historical saved rules plus the exact 0.10.34 control fragment. The fragment's
saved verification says it was deployed on 5 November, preserving other rules.
This is not a fresh console export. `firestore.indexes.json` is the historical
chat index, not a current index export. `firebase.json` is a newly added mapping
for developer review, not an existing recovered deployment configuration.
Do not deploy these over today's project without exporting and comparing it.
Retired messaging/avatar grants in the historical candidate need particular
review before any deployment; sharing/messaging were removed from the app.

No Cloud Functions source or deployment manifest was recovered. That does not
prove that no Functions are deployed. Auth providers, current rules/indexes,
Storage rules, App Check, API-key restrictions, IAM/service accounts, quotas,
billing/alerts, Hosting and live update/control document values still require
an authenticated console/export review.

## Known bugs, risks and validation limits

- Automatic login/location delay and CAPTCHA failures were user-reported. The
  latest bounded helpers were tested with synthetic inputs; real portal/device
  reliability remains unverified. Do not increase retry budgets to mask failures.
- 0.10.38 addresses Back/session return, but a schedule route needing ephemeral
  server form state may still require a normal foreground reload/sign-in. No
  unsafe POST replay or authentication bypass is included.
- Complete current readable production source, especially the restored updater,
  remains missing. The older whole-app fixture is not a safe release substitute.
- The 0.10.28 saved ZIP lacks its central directory. Nineteen complete entries
  were recovered with CRC verification; its damaged embedded APK was excluded.
  Later archives retain the corrected hours source and exact later APK inputs.
- Historical 0.10.38 evidence records **132 Android + 41 JS checks** passing.
  The later reconstructed 0.10.39 APK has fresh **53 JS** and package/signature/
  native-reference checks; its full Android suite was not rerun after recovery.
  Historical reports are not represented as checks newly run for this handoff.
- No physical Samsung installation, employer login, real CAPTCHA benchmark or
  phone packet capture was performed for this handoff. Tests must not contact
  the employer. Server-outage causation was never established by source review.
- Old pre-gate installations cannot be remotely halted by the new switch. The
  confirmed legacy hourly checker was present in several old public binaries;
  users must update and open a gate-compatible build to run migration cleanup.
- Reference-derived venue/studio art is illustrative, not a verified current
  studio-set replica. Avoid inferring a studio number from an unrelated venue.

## Successor's first steps

Receive the signing backup privately, export current Firebase configuration and
permissions, obtain an authorized test phone/session, then reconstruct a single
maintainable production source build with signer-preserving upgrade checks.
Keep the current foreground/cancellation/owner-control boundaries and widget
destinations intact. Record the exact source revision for each future release.
