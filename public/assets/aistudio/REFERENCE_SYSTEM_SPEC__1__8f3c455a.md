# Willow MUN Conference Management System — Complete Reference Technical Specification

> **Audit Scope & Constraint Notice**: This specification documents the actual verified implementation across frontend React/TypeScript modules, browser persistence layers, Supabase Edge Functions, and PostgreSQL migrations/RLS policies. Two invoked email Edge Functions (`willow-email-management` and `willow-application-email`) are deployed outside this repository; their exact client contracts and Postgres table interactions are documented, while their internal server source is explicitly marked unbundled. All environment secrets, API keys, project identifiers, and personal member PII are omitted or anonymized.

---

## 1. Executive Architecture Overview

### 1.1 Technology Stack & Runtime Topology
- **Frontend**: React 19 + TypeScript + Vite 8 single-page application (`package.json`), styled with Tailwind CSS v4 (`@tailwindcss/vite`), animated via `motion`, icons via `lucide-react`.
- **Routing**: Custom client-side `History.pushState` router (`src/utils/router.ts`) with custom `willowmun:navigate` event and `popstate` listeners (`usePathname`). Routes split into:
  - Public conference website (`/`, `/privacy`, `/terms`)
  - Portal auth & onboarding (`/portal`, `/super-admin-login`, `/admin-login`, `/head-login`, `/eb-login`, `/security-login`, `/staff-login`, `/eb-signup`, `/team-signup`, `/head-setup`)
  - Authenticated portals (`/super-admin/*`, `/admin/*`, `/head/*`, `/eb/*` auto-redirecting to `/head/*`, `/security/*`, `/staff/*`)
- **Backend Platform**: Supabase (`@supabase/supabase-js` v2.57.4) combining:
  - **Supabase Auth**: Email/password sessions (`supabase.auth.signInWithPassword`), admin user provisioning (`auth.admin.*`), recovery/invite links.
  - **PostgreSQL + Row-Level Security (RLS) + Triggers + PL/pgSQL RPCs**: Core transactional state, role/privilege guards, atomic QR scan locks, and audit tables.
  - **Private Supabase Storage**: Bucket `wm-application-files` (`100 MiB` max object size) accessed via signed PUT upload URLs and time-limited signed GET download URLs.
  - **Supabase Edge Functions (Deno)**: 7 bundled functions under `supabase/functions/` (`willow-applications`, `willow-qr`, `willow-staff-admin`, `willow-eb-signup`, `willow-hr-signup`, `willow-committees`, `willow-instagram`) plus 2 external unbundled functions (`willow-application-email`, `willow-email-management`).
- **QR & Mapping Libraries**: `qrcode.react` (`QRCodeSVG` pass rendering), `jsqr` + `MediaDevices.getUserMedia` + `BarcodeDetector` (live camera scanning), `d3-geo` + `topojson-client` + `world-atlas` (public map rendering).

### 1.2 Dual-Persistence Architecture (Supabase Live vs Browser `localStorage`)
A defining architectural characteristic of this codebase is the strict split between **server-authoritative Supabase tables** and **browser-local `localStorage` state** (`mockDataService.ts`, storage key `willow_mun_platform_snapshot_v5`):

| Domain | Authoritative Store | Persistence & Synchronization Notes |
|---|---|---|
| Public Applications & Attachments | Supabase (`wm_applications`, `wm_application_medical`, `wm-application-files`) | Live Edge Function (`willow-applications`) + Storage signed URLs; no `localStorage` fallback for live intake. |
| Accounts, Profiles & Permissions | Supabase (`auth.users`, `wm_profiles`, `wm_eb_signup_allowlist`) | Managed by `willow-staff-admin` and `willow-eb-signup`. |
| Invitations & Team Onboarding | Supabase (`wm_hr_signup_invites`, `wm_hr_signup_invite_tokens`, `wm_eb_signup_allowlist`) | Non-expiring HR tokens + allowlisted EB signup. |
| Application Decision Overrides & Spoof Audit | Supabase (`wm_application_decision_overrides`) | Super-Admin-only read/write via `willow-applications` + RLS. |
| QR Passes, Scans, Corrections, Resets | Supabase (`wm_qr_passes`, `wm_qr_scans`, `wm_qr_correction_logs`, `wm_qr_attendance_resets`) | Atomic PL/pgSQL RPCs (`wm_atomic_qr_checkin`, `wm_atomic_qr_checkout`, `wm_reset_all_qr_attendance`) + Supabase Realtime + `BroadcastChannel`. |
| Committees | Supabase (`wm_committees`) | Managed via `willow-committees`; public site loads published records with static fallback. |
| Department Registration Open/Close | Supabase (`wm_departments.registration_open`) | Live public polling (`30s`) + server-side Edge & RLS enforcement; also mirrored in `AdminStoreContext` snapshot. |
| Email Delivery History & Manual Confirmations | Supabase (`wm_email_deliveries` [external], `wm_email_manual_confirmations`) + `localStorage` (`wm_failed_emails_v1`, `wm_failed_email_gmail_opened_v1`) | Hybrid merge (`mergeAndDeduplicateFailedEmails`, `mergeEmailHistoryWithManualConfirmations`) ensures client-detected delivery errors are never lost. |
| Website CMS, Sponsors, Schedule, Announcements, FAQs, Docs, Gallery, Custom Forms | `localStorage` (`willow_mun_platform_snapshot_v5`) | `WebsiteCmsView`, `ConferenceCmsView`, `FormBuilderView` mutate `conferenceDataService` in `localStorage` only; does **not** sync across browsers or write to Postgres. |
| Staff Operations (`workspaceRecords`, `teamGroups`, `shifts`), Notifications, Security Violations Log, Monitoring Alerts | `localStorage` (`willow_mun_platform_snapshot_v5`) | `recordSecurityViolation` and `NotificationsCenterView` exist strictly in local browser storage, not a Postgres audit table. |
| Legacy `ApplicationsView` / `AdminStoreContext` CRUD wrappers | `localStorage` (`willow_mun_platform_snapshot_v5`) | Older context methods (`updateApplicationStatus`, `submitHeadRecommendation`, `createAccount`, etc.) update the mock snapshot, whereas active views (`LiveApplicationsView`, `HeadApplicationsView`, `HeadRecommendedView`, `AccountManagementView`) call Edge Functions directly. Exceptions: `overrideApplicationDecision` and `spoofApplicationDecision` in `AdminStoreContext` **do** call `willow-applications` directly. |

---

## 2. Authentication, Sessions, Roles & Access Control

### 2.1 Roles & Portals
`wm_profiles.role` allows exactly five values (enforced by database `CHECK` constraint):
1. `super_admin` — Full conference governance, exclusive account/role/override/spoof/reset/testing rights.
2. `admin` — Cross-department application decisions (Stage 2), email center, QR management/scanning, conference CMS, departments. **Blocked** from account management, role management, overrides, spoofing, attendance resets, and Department Testing Mode.
3. `department_head` — Scoped to assigned `department_id` and division/gender (`division`/`gender` column or title keywords). Can review **only pending** applications for allowed intake departments (`media`, `press`, `media-press`, `volunteers`, `security`), submit Stage 1 recommendations, view department QR grids (for Volunteering, Press & Media, Security), or operate specialized HR/DCC/Security modules.
4. `executive_board` — Unified with Department Heads on `/head` (`ExecutivePortal` treats `/head` via `DepartmentHeadPortal`). Differentiated by `eb_rank` (`head`, `co_head`, `member`) and `eb_permissions` (`manage_department`, `manage_committees`, `scan_qr`). `isEbHeadActor()` promotes EB `head` / `co_head` / `manage_department: true` / `"head"` in title / `applications.view: true` to `DEPARTMENT_HEAD_DEFAULT_PERMISSIONS`.
5. `staff` — Department-scoped staff portal (`/staff/:deptSlug`), or redirected unconditionally to `/security` if assigned to the `security` department.

### 2.2 Login Flow & Portal Isolation (`PortalAuthView` + `AdminStoreContext.signInWithCredentials`)
1. **What it does**: Authenticates users via Supabase Auth email/password, hydrates `wm_profiles` and `wm_departments`, verifies `is_active === true` and portal eligibility, and enters the target portal.
2. **How the user interacts with it**: User visits `/admin-login`, `/super-admin-login`, `/head-login`, `/eb-login`, `/security-login`, `/staff-login`, or `/portal` and submits email + password (minimum client validation).
3. **Implementing components**: `src/components/admin/PortalAuthView.tsx`, `src/App.tsx` (`AdminRouter`), `src/context/AdminStoreContext.tsx` (`signInWithCredentials`, `hydrateAuthUser`).
4. **Backend functions**: `supabase.auth.signInWithPassword`, direct PostgREST reads on `wm_profiles` & `wm_departments`, plus fallback invocation of `willow-qr` `{ action: "my_context" }` if `wm_departments` query fails or omits the user's department slug.
5. **Database structures**: `auth.users`, `wm_profiles`, `wm_departments`.
6. **Required permissions**:
   - Account must have `wm_profiles.is_active = true` and not be banned in `auth.users` (`ban_duration`).
   - `canAccessPortal(user, expectedPortal, departments)`:
     - `super_admin` can enter every portal (`/super-admin`, `/admin`, `/head`, `/security`, `/staff`).
     - `admin` enters `/admin` ONLY (blocked from `/security-login` unless `super_admin`, instructing Admins to use `/admin-login` -> `/admin/security`).
     - `department_head` / `executive_board` enter `/head`, and `/security` ONLY if `isSecurityAccount(user, departments)`.
     - `staff` enters `/security` if `isSecurityAccount`, else `/staff/:deptSlug`.
7. **Success / Failure & Edge Cases**:
   - If authenticated role does not match `expectedPortal`, `signInWithCredentials` immediately calls `supabase.auth.signOut()` and returns a portal-specific denial message (logging a `portal_auth` violation locally in `localStorage`).
   - Stale client Supabase tokens or unverified profiles fall back cleanly to `currentUser = null` without crashing `AdminRouter`.
   - When `authReady === true`, `AdminRouter` redirects logged-in users away from `*-login` pages and redirects legacy `/eb/*` paths to `/head/*`.

### 2.3 Permission Resolution & Super-Admin-Only Keys (`src/utils/adminPermissions.ts`)
- **47 defined `PermissionKey` strings** across 7 categories.
- **5 `SUPER_ADMIN_ONLY_KEYS`**:
  - `accounts.manage_admins`
  - `accounts.manage_heads`
  - `roles.manage`
  - `permissions.manage`
  - `testing.impersonate_head`
- **Multi-layer stripping**:
  1. `resolveUserPermissions()` strips all 5 `SUPER_ADMIN_ONLY_KEYS` for any role except `super_admin`.
  2. `hasPermission()` rejects `SUPER_ADMIN_ONLY_KEYS` for non-Super-Admins, hardcodes `applications.review = false` for `department_head`/`executive_board`, grants `qr.scan = true` unconditionally to `admin` and any active user in the `security` department, and restricts `department_head`/`executive_board` application access strictly to `['media', 'press', 'security', 'volunteers']` (requiring explicit `media` or `press` sub-scope).
  3. Edge Function `willow-staff-admin` (`sanitizePermissions`) strips `SUPER_ADMIN_ONLY_KEYS` before storing JSONB in `wm_profiles.permissions`.
  4. DB trigger `trg_wm_profiles_protect_privileges` (`20261118093000`) prevents non-service-role / non-Super-Admin SQL sessions from inserting/modifying `role`, `is_active`, `department_id`, `eb_rank`, `eb_permissions`, or `permissions`, and blocks client-side Super Admin role escalation/demotion/deletion.

### 2.4 Department Access Testing Mode (`DepartmentTestingView` + `AdminStoreContext`)
- **What it does**: Lets a `super_admin` preview `/head` isolated as any Department Head or EB Head account without logging out.
- **Interaction & Persistence**: Invoked from `/super-admin/testing` or the `Sign In As` button in `/super-admin/account-management`. Stores target UID in `sessionStorage` (`willow_mun_test_head_uid_v3`) and serialized profile in `willow_mun_test_head_profile_v1` (also supports `?testHead=` / `?testProfile=` URL parameters). Increments `testModeSessionVersion` and navigates to `/head`.
- **Quirk / Limitation**: `testModeHeadUser` switches the **frontend UI actor** (`AdminShell` sidebar, `HeadApplicationsView` client filter `scopeApplicationsForActor`), while underlying Edge Function calls (`willow-applications`, `willow-qr`) still send the Super Admin's real Supabase Bearer JWT! Because of that, server responses return all records to the Super Admin JWT, and `HeadApplicationsView` enforces the simulated Head's pending/department/gender filter client-side. Clicking **"Exit test session"** clears `sessionStorage` and returns to `/super-admin/testing`.

### 2.5 Alya Login Easter Egg (`src/components/admin/AlyaLoginEasterEgg.tsx` + `src/utils/alyaEasterEgg.ts`)
- **What it does**: Displays a 4-stage animated typewriter welcome sequence with botanical leaves and character medallion before entering `/head`.
- **Trigger (`shouldShowAlyaLoginEasterEgg`)**: Fires when the active `/head` actor (real login or Super Admin entering Department Testing Mode) matches the designated Media Head identity (checked via normalized email local-part, full name, title/department slug `'media'`) and has not yet been dismissed for the current `testModeSessionVersion:userId` key (`alyaIntroDismissedKey`).
- **Behavior**: User advances through beats 1–4; completion calls `markAlyaIntroSeenInSession(userId)` and reveals `DepartmentHeadPortal`. Sign-out or switching test-mode targets resets the dismissal key.

---

## 3. Public Website & Intake Pipeline (`ApplySection` + `ApplicationFileUploader`)

### 3.1 Public Application Submission & Availability Polling
1. **What it does**: Provides a public registration showcase & multi-track submission form on `/#apply` for four active tracks: `media`, `press`, `volunteer` (mapped to department slug `volunteers`), and `security`.
2. **How the user interacts with it**:
   - Selects a track card (`media`, `press`, `volunteer`, `security`). Closed tracks immediately render an "Applications Closed" panel and disable submission.
   - Fills shared contact/academic fields (full name, gender `Female`/`Male`, email, phone, school/university, grade/year, age, position), track-specific questionnaire fields (`answers`), optional medical condition disclosure (`Yes`/`No` + details), optional file uploads (portfolio/CV/samples), and mandatory legal checkboxes (Privacy Policy `/privacy` & Terms & Conditions `/terms` — **always initialized unchecked on page load/reload**).
   - Submits and receives an application confirmation code (`WM-XXXX...`).
3. **Implementing components**: `src/components/ApplySection.tsx`, `src/components/ApplicationFileUploader.tsx`, `src/utils/applicationForm.ts`, `src/utils/applicationAvailability.ts`, `src/services/applicationAvailabilityService.ts`, `src/components/LegalPages.tsx`.
4. **Backend functions**:
   - `fetchPublicApplicationAvailability()` queries `wm_departments` (`slug, registration_open`) with 30-second polling (`POLL_INTERVAL_MS = 30_000`) + `visibilitychange` refresh.
   - `willow-applications` Edge Function:
     - `action: "init_upload"` — Validates department registration is open, sanitizes filename, creates a signed upload URL (`createSignedUploadUrl`, `upsert: false`) inside private bucket `wm-application-files` under `{appType}/{yyyy-mm}/{uuid}-{safeName}`.
     - `action: "submit"` — Validates fields, checks `privacy_policy_accepted === true && terms_accepted === true` (`legal_consent_version: '2026-11-22'`), checks `wm_departments.registration_open === true`, normalizes email, enforces duplicate-pending check (`lower(application_type)` + `lower(email)` where `status = 'pending'`), generates unique `WM-` application code, inserts into `wm_applications`, then inserts medical fields into `wm_application_medical` (rolling back `wm_applications` row if medical insert fails).
5. **Database structures**:
   - `wm_departments` (public anon `SELECT` policy for `registration_open`, tightened in `20261119000100` & `20261119180000`).
   - `wm_applications` (unique partial index preventing duplicate pending apps per `(lower(application_type), lower(email))` + insert policy requiring open department registration + consent columns from `20261122010000`).
   - `wm_application_medical` (`1:1` FK `application_id -> wm_applications.id ON DELETE CASCADE`).
   - Storage bucket `wm-application-files` (private, `file_size_limit = 104857600` [100 MiB] per `20261118193000`, restrictive MIME allowlist).
6. **Required permissions**: Anonymous public access via Supabase `anon`/publishable key + Edge Function server checks. Direct client reads/writes to `wm_application_medical` or `wm-application-files` objects are blocked for anonymous users.
7. **Success / Failure & Edge Cases**:
   - **File upload fallback**: If `init_upload` fails or returns no signed URL, `ApplicationFileUploader` falls back to inline base64 data URLs (`inlineMaxBytes` capped so large files do not bloat JSON payloads; signed PUT handles up to 100 MiB).
   - **Duplicate pending submission**: Returns HTTP `409` with a descriptive prompt; previously rejected/accepted applicants can reapply only if no pending row exists for that track + email.
   - **Closed department race**: Even if UI state is stale, both `init_upload`, `submit`, and the Postgres `INSERT` RLS policy reject submissions when `registration_open = false`.

---

## 4. Head Portal (`/head/*`, `DepartmentHeadPortal.tsx`)

Routes under `/head/*` (and legacy `/eb/*`, auto-redirected to `/head/*` by `AdminRouter`):

### 4.1 Scoped Pending Application Review & Stage 1 Recommendations (`/head/applications`, `HeadApplicationsView.tsx`)
1. **What it does**: Displays strictly pending applications matching the Head/EB Head's exact department, Media/Press sub-scope, and gender division, allowing Stage 1 `recommend_accept` or `recommend_reject` decisions with evaluation notes.
2. **How the user interacts with it**:
   - Views KPI tiles (`Pending Queue`, `Recommended Accept`, `Recommended Reject`, `Awaiting Recommendation`), searches by name/code/school, or filters by recommendation status.
   - Opens an applicant dossier card to read non-medical answers and view/download signed attachments (`ApplicationAttachmentsViewer`).
   - Enters optional recommendation notes and clicks **Recommend Accept** or **Recommend Reject** (can also update/change their recommendation while the application remains `pending`).
   - **Zero Decision Visibility**: The moment an Admin or Super Admin accepts, rejects, or waitlists an application, it vanishes from the Head's list on the next `12s` background poll, window focus, or visibility change (and is blocked server-side if the Head clicks an action right after an Admin decides).
3. **Implementing components**: `src/components/admin/portals/DepartmentHeadPortal.tsx`, `src/components/admin/views/HeadApplicationsView.tsx`, `src/components/admin/ApplicationAttachmentsViewer.tsx`, `src/utils/applicationFilters.ts` (`scopeApplicationsForActor`), `src/utils/adminPermissions.ts` (`canAccessApplication`, `getActorGenderScope`, `getMediaPressSubScope`).
4. **Backend functions**:
   - `willow-applications` (`action: "list"`, `action: "recommend"`, `action: "sign_attachment"`) + `supabase/functions/willow-applications/policy.ts` (`resolveHeadContext`, `canHeadAccessApplication`, `redactApplicationForHead`).
5. **Database structures**: `wm_applications`, `wm_departments`, `wm_profiles`, Storage `wm-application-files`.
   - Trigger `wm_applications_before_write` (`20261124030000`) validates non-admin updates can ONLY modify `head_recommendation`, `head_notes`, `recommended_by`, `recommended_by_name`, `recommended_at` when `lower(OLD.status) = 'pending'`.
   - RLS `SELECT` policy (`20261124030000`) enforces `lower(status) = 'pending'`, department match, Media/Press match, and gender match (`wm_head_gender()`).
6. **Required permissions**: `role IN ('department_head', 'executive_board')` (with `isEbHeadActor` check), `is_active = true`, `applications.view !== false`, `applications.recommend !== false`, `actorDeptSlug IN ('media', 'press', 'media-press', 'volunteers', 'security')`, and a resolved `actorGender` (`male` or `female`).
7. **Success / Failure & Edge Cases**:
   - **No status probing**: In `willow-applications` (`recommend` and `sign_attachment`), `isHeadActorScopeMatch` (department + Media/Press + gender) is evaluated **before** checking `status === 'pending'` so an out-of-scope Head gets `403` regardless of status, and an in-scope Head probing an already-decided ID gets a generic `"Application is no longer available for Head review."` (`409`) without revealing whether the applicant was accepted or rejected.
   - **Redaction**: `redactApplicationForHead()` sets `decision_by`, `decision_by_name`, `decision_at`, `admin_decision_notes`, and `review_notes` to `null`.
   - **Notification leak prevention**: `AdminStoreContext.notifications` strips notifications with `category === 'application'` or final decision keywords (`accepted`, `rejected`, `waitlisted`, `override`, `spoof`) when the viewer is a Head/EB member.
   - **Medical isolation**: `wm_application_medical` is never joined or returned to Heads.

### 4.2 HR Modules (`/head/hr-accepted`, `/head/emails`)
- **Accepted Applicants Roster (`HrAcceptedApplicantsView.tsx`)**:
  - Accessible to active `admin`, `super_admin`, or any active `department_head` / `executive_board` whose department is `hr` (`isHrActor`).
  - Calls `willow-applications` `action: "hr_accepted"` (cross-department and cross-gender accepted list, with medical fields stripped for HR).
  - Clicking an applicant's email invokes `createHrApplicantSignupInvite(application.id)` (`willow-hr-signup` `create_invite`), opens a prefilled Gmail compose popup (`Willow MUN — Application Accepted` + non-expiring `/team-signup?token=...` link).
- **Emails Dashboard (`/head/emails`, `EmailsDashboardView.tsx`)**:
  - HR actors share access to `EmailsDashboardView` via `canAccessEmailsDashboard` & `canDispatchEmails` (unless explicitly unauthorized). See Section 6 for full email architecture.

### 4.3 DCC Committees Management (`/head/committees`, `CommitteesManagementView.tsx`)
- Accessible to `super_admin`, `admin`, or DCC / `committees.manage` Heads/EB (`isDccOrAdmin` in `willow-committees`).
- Calls `willow-committees` (`list`, `upsert`, `delete`) to manage chambers, abbreviations, difficulty (`Beginner`/`Intermediate`/`Advanced`/`Crisis`), descriptions, topics, chair/vice-chair names, capacities, publish flags, and sort order in `wm_committees`.

### 4.4 Head Department QR Sections & Entrance Scanner (`/head/volunteering`, `/head/press-media`, `/head/scanner`, `/head/qr`)
- **Volunteering & Press/Media Heads**: View read-only QR pass cards (`DepartmentQrSectionView`) for members of their department (calling `willow-qr` `action: "department_passes"` with RPC fallback `wm_get_department_qr_passes`).
- **Security Heads / EB**: Access `/head/scanner` (live Check In / Check Out camera scanner + `My Scans` + Security QR grid via `DepartmentQrSectionView`).
- **Personal QR (`/head/qr`)**: Renders `QrAttendanceView` in personal pass mode or `MyQrModal` (top bar `My QR` button always available in `AdminShell`).

---

## 5. Admin & Super Admin Portals (`/admin/*`, `/super-admin/*`, `ExecutivePortal.tsx`)

Both portals share `ExecutivePortal.tsx` (`AdminPortal.tsx` wraps `portal="admin"`; `SuperAdminPortal.tsx` wraps `portal="super_admin"`).

### 5.1 Live Applications & Decision Queues (`LiveApplicationsView.tsx` & `HeadRecommendedView.tsx`)
Routes: `/applications`, `/staff-apps`, `/pending-applications`, `/accepted-applicants`, `/rejected-applicants`, `/recommendations`.
1. **What it does**: Provides complete cross-department applicant review, Head recommendation review, Stage 2 final decisions (`accepted`, `rejected`, `waitlisted`, `pending`), internal administrative notes, medical disclosure visibility (when `applications.view_confidential = true`), and attachment downloads.
2. **How the user interacts with it**:
   - Filters by search query, department, track, status, Head recommendation, or date; selects an applicant dossier (`LiveApplicationDossierCard`).
   - Clicks **Accept**, **Reject**, **Waitlist**, or **Pending** with optional `review_notes`.
   - For Super Admins, an **Override** button opens `OverrideDecisionModal` requiring a rationale (`>= 8` characters).
3. **Implementing components**: `src/components/admin/views/LiveApplicationsView.tsx`, `src/components/admin/views/HeadRecommendedView.tsx`, `src/components/admin/OverrideDecisionModal.tsx`, `src/components/admin/ApplicationAttachmentsViewer.tsx`, `src/utils/decisionAttribution.ts`.
4. **Backend functions**: `willow-applications` (`list`, `list_recommended`, `update`, `override_decision`, `sign_attachment`, `hr_accepted`) + external `willow-application-email` (invoked by client after `override_decision`; note `update` in `LiveApplicationsView`/`HeadRecommendedView` updates status in DB and email dispatch happens from `EmailsDashboardView` or `overrideApplicationDecision`).
5. **Database structures**: `wm_applications`, `wm_application_medical`, `wm_application_decision_overrides`, `wm_qr_passes`.
6. **Required permissions**: `applications.view`, `applications.review` (Stage 2 decisions), `applications.view_confidential` (for `wm_application_medical`), `super_admin` exclusively for `override_decision`.
7. **Success / Failure & Edge Cases (Decision Locking & Optimistic Concurrency)**:
   - **Decision Locking**: Once `status` is `accepted` or `rejected`, standard `admin` accounts **cannot** overwrite a decision made by another reviewer (`existing.decision_by !== auth.uid()` returns `403`). Even the original deciding admin cannot bypass `update` restrictions if superseded—Wait: in `willow-applications` `update`, an admin who originally made the decision (`existing.decision_by === auth.uid()`) *can* re-update if needed, whereas any *other* non-super-admin gets `403`.
   - **Optimistic Locking**: `update` filters `.eq("status", existing.status)` and `.eq("decision_by", existing.decision_by)` (or `.is("decision_by", null)`), returning HTTP `409` on concurrent edits.
   - **QR Pass Provisioning Quirk**: Setting `status = 'accepted'` in `update` upserts an active `wm_qr_passes` row; however, changing an `accepted` applicant to `rejected`/`pending` via `update` does **not** run the deactivation update on `wm_qr_passes` that `override_decision` and `spoof_decision` explicitly run (`wm_qr_passes.active = false`).

### 5.2 Super Admin Decision Spoofing (`/super-admin/spoof`, `LiveApplicationsView` `spoofMode`)
1. **What it does**: Allows **only** `super_admin` to change any application's decision (`accepted`, `rejected`, `waitlisted`, `pending`) across any current status while attributing the visible `decision_by` / `decision_by_name` to a selected existing active `admin` or `super_admin` account—without exposing that it was spoofed and without auto-sending decision emails.
2. **How the user interacts with it**:
   - Navigates to **Spoof** in the left sidebar (`/super-admin/spoof`, `Access & Systems` group).
   - Views all applications (pending, accepted, rejected, waitlisted) with current status and decision attribution.
   - Clicks **Spoof** on any card, picks target status (`Accepted`, `Rejected`, `Waitlisted`, `Pending`), selects an active Admin from the dropdown (`list_spoof_admins`), optionally adjusts notes, and submits.
   - Super Admin can also inspect the private **Spoof Audit Log** panel (`list_spoof_audit`) showing true actor, previous decision maker, and spoofed attribution.
3. **Implementing components**: `src/components/admin/views/LiveApplicationsView.tsx` (`spoofMode` + `SpoofModal` + audit drawer), `src/context/AdminStoreContext.tsx` (`spoofApplicationDecision`), `src/utils/decisionAttribution.ts` (`validateSpoofRequest`, `cleanDecisionMakerName`, `formatDecisionByLabel`, `normalizeAssignableAdmins`).
4. **Backend functions**: `willow-applications` (`list_spoof_admins`, `spoof_decision`, `list_spoof_audit`).
5. **Database structures**:
   - `wm_applications` (`status`, `decision_by`, `decision_by_name`, `decision_at`, `admin_decision_notes`, `review_notes`).
   - `wm_application_decision_overrides` (`is_spoof = true`, `actor_user_id`, `actor_name`, `previous_decision_by`, `previous_decision_by_name`, `spoofed_decision_by`, `spoofed_decision_by_name`, `reason`, `20261124010000`).
   - `wm_qr_passes` (activated when spoofed to `accepted`, deactivated when moving off `accepted`).
6. **Required permissions**: Strictly `role === 'super_admin'` and `is_active === true`. Double-checked in `ExecutivePortal`, `AdminStoreContext`, `willow-applications`, and `wm_application_decision_overrides` RLS (`20261124010000`).
7. **Success / Failure & Edge Cases**:
   - **Stealth Attribution**: `willow-applications` writes ONLY the clean Admin name (`"<Admin Full Name>"`) into `decision_by_name`, never appending `(attributed by Super Admin: ...)`. `cleanDecisionMakerName()` and migration `20261124020000` also strip any legacy parenthetical attribution tags so all UI surfaces render simply `"Rejected by <Admin>"` / `"Accepted by <Admin>"`.
   - **Email Silence**: `spoofApplicationDecision()` deliberately **does NOT** invoke `willow-application-email`, allowing retroactive/administrative attribution adjustments without alerting applicants.
   - **Pending Reset**: Spoofing to `pending` clears `decision_by`, `decision_by_name`, and `decision_at` to `null` without requiring an Admin selection (`validateSpoofRequest`).

### 5.3 Application Management (`/admin/application-management`, `/super-admin/application-management`)
- `ApplicationManagementView.tsx` fetches live `wm_departments` (`registration_open`) + `willow-applications` counts (`total`, `pending`, `accepted`, `rejected`) and provides per-track ON/OFF switches (`media`, `press`, `volunteers`, `security`). Toggling updates both `AdminStoreContext` and `wm_departments.registration_open` directly via Supabase client.

### 5.4 Account Management & EB Onboarding Governance (`/super-admin/account-management`, `/super-admin/admins`, `/super-admin/eb-signup-link`, `/super-admin/testing`)
- **Account Management (`AccountManagementView.tsx` -> `willow-staff-admin`)**:
  - Three tabs: `Admins`, `Heads & EB`, `Staff`.
  - Actions: `list`, `create`, `update`, `update_eb_roster`, `delete_eb_roster`, `create_eb_invite`, `suspend` (bans auth user `876000h`, sets `is_active = false`, disables `wm_qr_passes.active = false`), `reactivate`, `reset_password` (min 10 chars), `send_setup_link` (`recovery` link to `/head-setup`), `resend_invite`, `delete`.
  - **Safe Delete Sequence**: Before calling `auth.admin.deleteUser(userId)`, `willow-staff-admin` nulls user FKs in `wm_applications.decision_by`, `wm_committees.updated_by`, `wm_qr_scans.scanned_by`, `wm_eb_records.created_by/updated_by`, resets `wm_eb_signup_allowlist` claim columns, and deletes `wm_eb_record_acks`, `wm_qr_passes`, and `wm_profiles`. PostgreSQL FKs in `20261118093000` also cascade `ON DELETE SET NULL`.
- **Admin View Fallback (`LiveStaffAccountsView.tsx`)**: If an Admin inspects `/admin/admins`, it is strictly read-only directory access (`accounts.view`).

### 5.5 Website CMS & Legacy Route Whitelist Quirk (`ExecutivePortal.tsx`)
`ExecutivePortal.tsx` defines JSX render handlers and `SECTION_META` entries for legacy/CMS routes (`delegates`, `forms`, `teams`, `shifts`, `deployment`, `rosters`, `groups`, `gallery`, `pages`, `sections`, `media`, `navigation`, `seo`, `versions`, `email`, `notifications`, `registration`, `logs`, `monitoring`, `roles`, `permission-defs`), **but `westPortalSections` (`lines 300–334`) does NOT include those keys**. Consequently, navigating to any of them hits `unsupportedPortalSection = !westPortalSections.has(section)` and displays **"Access Restricted: This section is not part of the Willow MUN management portal."** Only the `westPortalSections` whitelist (~34 active sections) is reachable at runtime.

---

## 6. Email Infrastructure & Manual Gmail Fallback

### 6.1 Dual-Source Architecture (External Edge Functions + Local Hybrid Persistence)
1. **What it does**: Manages bulk and individual acceptance/rejection email delivery, editable email templates, delivery history, automated retry, manual **Open in Gmail** drafts, and **Mark as Sent** manual confirmations.
2. **External Unbundled Edge Functions**:
   - **`willow-email-management`** (source not in repo):
     - `{ action: 'dashboard' }` -> returns `{ deliveries: wm_email_deliveries[], templates: wm_email_templates[] }`
     - `{ action: 'retry', delivery_id }` -> attempts immediate resend
     - `{ action: 'save_template', template_key, subject, body_text }` -> saves template overrides
   - **`willow-application-email`** (source not in repo):
     - `{ application_id, decision: 'accepted' | 'rejected', force_resend?: boolean }` -> resolves template + generates/attaches HR signup link for accepted applicants, dispatches via external mail relay, logs to `wm_email_deliveries`.
3. **Hybrid Failed-Email Tracking (`src/utils/failedEmails.ts`)**:
   - Any non-confirmed, threw, timed-out, or `status: 'pending'`/`failed` response (`interpretSendResponse()`) is immediately persisted to `localStorage` (`wm_failed_emails_v1`) via `upsertLocalFailedEmail()`.
   - `sanitizeEmailError()` redacts Bearer tokens, JWTs (`eyJ...`), credentialed URLs, `api_key`/`password`/`secret` pairs, and Deno/JS stack traces before storing or rendering errors.
   - `mergeAndDeduplicateFailedEmails()` deduplicates by `key = "${applicantId}|${emailType}"` (or `email:${email}|${emailType}`) across server `wm_email_deliveries` and `localStorage`, auto-clearing stale local entries once server confirms `sent` at/after the last failure timestamp.

### 6.2 Failed to Send -> "Open in Gmail" & "Mark as Sent" (`FailedToSendTab.tsx`, `EmailsDashboardView.tsx`)
1. **How the user interacts with it**:
   - In `/admin/emails` or `/head/emails` -> **Failed to Send** tab, each failed record renders recipient details, subject, sanitized error, preview toggle, **"Failed to Send"** status tag, **"Open in Gmail"** button, **"Mark as Sent"** button, and **"Retry"** button.
   - Clicking **Open in Gmail**:
     1. Immediately calls `window.open('', '_blank')` synchronously to survive browser popup blockers.
     2. If `emailType === 'accepted'` and the body/record lacks a `/team-signup?token=` URL, calls `createHrApplicantSignupInvite(applicantId)` (`willow-hr-signup` `create_invite`) and injects it via `applySignupLinkToBody()` (replacing `{{signup_link}}`, `{{signupUrl}}`, or legacy URLs).
     3. Navigates the popup to `https://mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...` using normalized LF newlines and `encodeURIComponent`.
     4. Saves opened timestamp in `wm_failed_email_gmail_opened_v1` (`"Opened in Gmail at HH:MM"` indicator) while **keeping the item marked Failed to Send** until manually confirmed or retried.
   - Clicking **Mark as Sent** -> opens confirmation modal -> runs 3-tier persistence:
     1. Edge Function `willow-applications` `action: "mark_email_sent"` (writes `wm_email_manual_confirmations` AND upgrades matching failed/pending `wm_email_deliveries` rows to `status = 'sent', delivery_method = 'manual_gmail'`).
     2. Fallback RPC `wm_mark_email_manually_sent` (`20261121010000`).
     3. Fallback direct RLS `UPSERT` into `wm_email_manual_confirmations`.
     4. Clears matching local failure key & opened-timestamp cache and updates **Email History** (`Successfully Sent` + `Manual via Gmail` tag via `mergeEmailHistoryWithManualConfirmations()`).
2. **Edge Cases**:
   - If `hasValidRecipientEmail(record.recipientEmail)` is false, **Open in Gmail**, **Mark as Sent**, and **Retry** are disabled and an explicit missing-email banner is shown.
   - Each failed record resolves its own exact attempted `subject` + `bodyText` (or interpolates `DEFAULT_EMAIL_TEMPLATES` via `resolveEmailContent()`) so individual recipients never collide.

---

## 7. Invitation & Account Creation System

### 7.1 Executive Board Allowlist Signup (`/eb-signup`, `ExecutiveBoardSignupView.tsx` + `willow-eb-signup`)
1. **What it does**: Single shared URL onboarding (`/eb-signup`) for allowlisted Executive Board members pre-entered in `wm_eb_signup_allowlist`.
2. **How it works**:
   - Member enters their registered EB email and chooses a password (`10–128` chars).
   - `willow-eb-signup` matches `email` against `wm_eb_signup_allowlist.email` and `email_aliases` (must match exactly 1 unclaimed row).
   - Acquires an atomic 15-minute reservation lock (`claim_started_at` null or older than 15 minutes).
   - Calls `auth.admin.createUser({ email, password, email_confirm: true })`, upserts `wm_profiles` (`role = 'executive_board'`, `department_id`, `eb_rank`, `eb_permissions`, `permissions`), and sets `claimed_at`, `claimed_user_id`, clearing `claim_started_at` and `invite_token_hash`.
   - Rolls back (`auth.admin.deleteUser` + clears `claim_started_at`) on any failure.
3. **Important Implementation Quirk**:
   - `willow-eb-signup` enforces a strict **3-origin CORS allowlist** (`APP_ORIGIN`, the Supabase origin, and one dev preview origin). Requests from unallowlisted preview/localhost origins receive HTTP `403`.
   - `willow-staff-admin` `create_eb_invite` generates a URL pointing directly to the Edge Function GET/query endpoint (`https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/willow-eb-signup?token=...&email=...`), whereas `willow-eb-signup` only accepts `POST` JSON `{ email, password }` and ignores `token`! The active `/super-admin/eb-signup-link` UI (`EbSignupLinkView.tsx`) instead distributes `${window.location.origin}/eb-signup` directly.

### 7.2 HR Non-Expiring Applicant Signup Invites (`/team-signup`, `HrApplicantSignupView.tsx` + `willow-hr-signup`)
1. **What it does**: Issues permanent, single-use, non-expiring personal signup links (`/team-signup?token=<64-hex>`) for **accepted** applicants only.
2. **Invite Generation (`create_invite`)**:
   - Callable by `admin`, `super_admin`, or `hr` Heads/EB (`isHr`).
   - Requires `app.status === 'accepted'` (`409` otherwise) and unclaimed `wm_hr_signup_invites` (`409` if already claimed).
   - Reuses existing `token_value` whenever present; for legacy rows without `token_value`, generates a 32-byte random hex token, saves SHA-256 `token_hash` into `wm_hr_signup_invite_tokens` (so earlier emailed legacy tokens keep working alongside the newer token per `20261120103000`).
3. **Account Claim (`signup`)**:
   - Validates 64-hex token against SHA-256 `token_hash` in `wm_hr_signup_invites` or `wm_hr_signup_invite_tokens`.
   - Acquires `claim_started_at` lock (`WHERE claimed_at IS NULL`).
   - Re-verifies `app.status === 'accepted'` and confirms email is not already registered in `auth.users`.
   - Auto-assigns role from `app.position`: matches `/\b(co[- ]?head|department head|head of|head)\b/i` -> `department_head`, otherwise -> `staff`.
   - Resolves `department_id` via `normalizeDept` + `wm_departments` lookup, creates confirmed Auth user (`email_confirm: true`), upserts `wm_profiles` (carrying `gender`, `title`, `department_id`), and marks `claimed_at`. Rolls back auth user and lock on error.

### 7.3 Head Password Setup (`/head-setup`, `HeadPasswordSetupView.tsx`)
- Consumes Supabase Auth recovery/invite hash tokens (`#access_token=...` / OTP) generated by `willow-staff-admin` (`create` without password or `send_setup_link`), lets the user set a password (`supabase.auth.updateUser({ password })`), and routes them into `/head`.

---

## 8. QR Attendance & Department Pass System

### 8.1 Token Provisioning & Security (`willow-qr` + SQL `20261118170000`, `20261119000200`)
- **Token Format**: `'WMQR-' + 16 random bytes hex` (37 chars, opaque, non-guessable); stored as SHA-256 `token_hash` in `wm_qr_passes` plus `token_value` (used for rendering QR SVGs in authorized owner/admin/department queries).
- **Auto-Provisioning DB Triggers**:
  - `trg_wm_profiles_provision_qr` (`AFTER INSERT OR UPDATE ON wm_profiles`): provisions or updates a `staff`-holder pass when active.
  - `trg_wm_applications_accepted_qr` (`AFTER INSERT OR UPDATE ON wm_applications`): automatically provisions an active `applicant`-holder pass when `status = 'accepted'`.
- **Pass Owner Lookup (`my_pass`)**: Ensures active `wm_profiles` user always has an active pass (`ensurePassForUser`) and strips `token_hash` when returning `MyQrModal` / `MyQrCard` payload.

### 8.2 Live Check-In / Check-Out & Duplicate Protection (`LiveQrScannerWorkspace.tsx` + `willow-qr`)
1. **What it does**: Simplified, high-speed entrance scanner used on `/security`, `/admin/qr`, and `/super-admin/qr` (plus `DepartmentQrSectionView` for Security heads).
2. **Scanner UI Scope**:
   - **Simplified Live Scanner (`LiveQrScannerWorkspace`)**: Contains Check In / Check Out mode toggle, live camera viewfinder (`BarcodeDetector` primary + `jsqr` canvas fallback + manual/USB barcode input), immediate feedback banner (full name, role/department, pass code, action state), and side-by-side **Checked In** vs **Not Checked In** live attendance rosters. Zero confirmation modal required for first check-in.
   - **Full Registry (`QrAttendanceView`, `/admin/attendance`, `/super-admin/attendance`)**: 4 tabs — `Check-In Registry`, `Scan Activity`, `Corrections Audit`, `My QR` — allowing `super_admin` / `admin` manual attendance corrections (`manual_correct` writing to `wm_qr_correction_logs`) and `super_admin`-only attendance reset.
3. **Atomic Backend Execution**:
   - **Check-In (`wm_atomic_qr_checkin` RPC, `20261120120000`)**:
     - Acquires `FOR UPDATE` row lock on `wm_qr_passes` matching `token_hash`.
     - If `checked_in_at IS NOT NULL`: **does NOT overwrite original check-in timestamp or gate**; logs `already_checked_in` in `wm_qr_scans` and returns `{ duplicate: true, scan_outcome: 'already_checked_in' }` with prominent warning banner & duplicate sound/haptic alert.
     - If valid first check-in (`checked_in_at IS NULL`): sets `checked_in_at = now()`, `checked_in_by`, `checked_in_gate`, `scan_count += 1`, and trigger `wm_qr_clear_checkout_on_checkin` clears `checked_out_at` / `checked_out_by` / `checked_out_gate` for a clean fresh cycle.
   - **Check-Out (`wm_atomic_qr_checkout` RPC, `20261119120000` / `20261120120000`)**:
     - Requires prior check-in (cannot check out someone never checked in).
     - If already checked out (`prior_checkout_count >= 1`) and `confirm_repeat !== true`: returns `checkout_warning` asking staff to confirm repeat check-out before recording `valid_checkout` and incrementing `checkout_count`.
4. **Multi-Scanner Live Synchronization (`LiveQrScannerWorkspace`)**:
   - Broadcasts check-in/check-out/reset events across browser tabs (`BroadcastChannel('wm-qr-attendance-sync')`) and across devices (`Supabase Realtime` channel broadcast + `postgres_changes` on `wm_qr_passes`).
   - Runs visibility-aware `4s` polling + `focus` / `online` refetch fallback.
5. **Super Admin Global Attendance Reset (`reset_all_attendance` -> `wm_reset_all_qr_attendance`)**:
   - Strictly `super_admin` (`20261119123000`). Requires exact typed confirmation (`"RESET"`). Atomically clears `checked_in_at`, `checked_out_at`, `checked_in_by`, `checked_out_by`, `checked_in_gate`, `checked_out_gate`, `scan_count`, `checkout_count` on all `wm_qr_passes`, deletes scan logs with outcomes `valid_checkin | valid_checkout | already_checked_in | duplicate_recent`, and records an immutable summary row in `wm_qr_attendance_resets`.

### 8.3 Department QR Sections & Staff Portal (`DepartmentQrSectionView.tsx`, `StaffPortal.tsx`)
- **Simplified QR Staff (`volunteers`, `media`, `press`)**: `StaffPortal` displays **only** `MyQrCard` (`isSimplifiedQrStaffDepartment`) with no extra workspace clutter.
- **Full Staff (`it`, `design`, `marketing`, `hr`, `dcc`)**: Shows Department Overview, Workspace tasks, Team Roster, My Shifts (backed by `localStorage`), and My QR.
- **Department QR Grids (`DepartmentQrSectionView`)**: Renders QR code cards for `volunteers`, `press_media`, or `security`.
- **Quirk / Mismatch**: SQL migration `20261122020000` (`wm_actor_qr_section`) grants `department_passes` access to `staff`, `department_head`, `executive_board`, `admin`, and `super_admin` inside the matching department; **however**, Edge Function `willow-qr/index.ts` checks `ALLOWED_DEPT_QR_ROLES` and rejects `staff` if they hit `department_passes` directly (and `canViewDepartmentQr` in `adminPermissions.ts` is only mounted in `ExecutivePortal` and `DepartmentHeadPortal`, not `StaffPortal`, except Security staff routed to `SecurityScannerPortal`).

---

## 9. Database Schema, Functions, Triggers, RLS & Migrations Ledger

### 9.1 Core Tables & Relationships
| Table | Purpose & Key Columns | Key Constraints / Relationships |
|---|---|---|
| `wm_departments` | Conference departments (`id`, `slug`, `name`, `registration_open`, `updated_at`) | Unique `slug`. Read publicly for `registration_open`. |
| `wm_profiles` | Staff/Head/EB/Admin profiles (`user_id` PK -> `auth.users.id`, `full_name`, `role`, `department_id` -> `wm_departments.id`, `title`, `division`, `gender`, `is_active`, `eb_rank`, `eb_permissions`, `permissions`) | `role` CHECK (`super_admin`, `admin`, `department_head`, `executive_board`, `staff`); protected by privilege trigger. |
| `wm_eb_signup_allowlist` | Pre-approved EB roster (`member_key` PK, `email`, `email_aliases`, `full_name`, `department_id`, `eb_rank`, `eb_permissions`, `permissions`, `gender`, `invite_token_hash`, `claim_started_at`, `claimed_at`, `claimed_user_id`) | Single-claim lock (`claimed_at`, `claim_started_at`). |
| `wm_applications` | Intake records (`id`, `application_code`, `application_type`, `department_id`, `applicant_name`, `email`, `gender`, `position`, `answers` JSONB, `attachments` JSONB, `status`, `head_recommendation`, `head_notes`, `recommended_by`, `recommended_by_name`, `recommended_at`, `decision_by`, `decision_by_name`, `decision_at`, `admin_decision_notes`, `review_notes`, `privacy_policy_accepted`, `terms_accepted`, `legal_consent_version`, `consent_accepted_at`) | Unique partial pending index on `(lower(application_type), lower(email)) WHERE status = 'pending'`; `decision_by` & `recommended_by` `ON DELETE SET NULL`. |
| `wm_application_medical` | Confidential medical disclosure (`application_id` PK/FK -> `wm_applications.id ON DELETE CASCADE`, `medical_has_conditions`, `medical_details`) | Isolated strictly to `super_admin` / `admin` with `applications.view_confidential`. |
| `wm_application_decision_overrides` | Immutable audit log for both Override and Spoof (`id`, `application_id` FK, `previous_status`, `new_status`, `reason`, `actor_user_id`, `actor_name`, `is_spoof`, `previous_decision_by`, `previous_decision_by_name`, `spoofed_decision_by`, `spoofed_decision_by_name`, `created_at`) | Strict `super_admin`-only RLS SELECT/INSERT (`20261123010000`, `20261124010000`). |
| `wm_hr_signup_invites` & `wm_hr_signup_invite_tokens` | Non-expiring HR invite state (`id`, `application_id` unique FK, `token_hash`, `token_value`, `issued_by`, `claim_started_at`, `claimed_at`, `claimed_user_id`; child alias table `invite_id`, `token_hash`, `token_value`) | Preserves legacy invite hashes alongside regenerated tokens (`20261120103000`). |
| `wm_email_manual_confirmations` | Manual Gmail send confirmations (`id`, `application_id`, `decision_status`, `server_delivery_id`, `recipient_name`, `recipient_email`, `department_id`, `subject`, `body_text`, `attempt_count`, `sent_at`, `confirmed_by`, `confirmed_by_name`, `confirmed_by_email`) | Unique constraint on `(application_id, decision_status)`. |
| `wm_email_deliveries` & email template table *(external-managed)* | Automated email queue/logs & templates | Read/updated by `willow-email-management`, `willow-application-email`, and `willow-applications` (`mark_email_sent`). |
| `wm_qr_passes` | Permanent QR credentials (`id`, `holder_type`, `user_id`, `application_id`, `full_name`, `role_label`, `department_slug`, `pass_code`, `token_hash`, `token_value`, `active`, `checked_in_at`, `checked_in_by`, `checked_in_gate`, `checked_out_at`, `checked_out_by`, `checked_out_gate`, `scan_count`, `checkout_count`) | Unique `token_hash` & `pass_code`; partial unique on `user_id` & `application_id`. |
| `wm_qr_scans`, `wm_qr_correction_logs`, `wm_qr_attendance_resets` | Scan event log (`valid_checkin`, `valid_checkout`, `already_checked_in`, `duplicate_recent`, `invalid_token`, `revoked_pass`), Admin manual attendance edits, and Super Admin global reset log | `scanned_by` `ON DELETE SET NULL`. |
| `wm_committees` | Conference committees (`id`, `chamber`, `name`, `abbreviation`, `difficulty`, `description`, `topics`, `chair_name`, `vice_chair_name`, `capacity`, `published`, `sort_order`, `updated_by`) | Managed via `willow-committees`. |
| `wm_eb_records`, `wm_eb_record_acks` | EB internal records/acknowledgements referenced in safe user-delete cleanup (`willow-staff-admin`) | `created_by`/`updated_by` `ON DELETE SET NULL`; acks deleted on user deletion. |

### 9.2 Key PL/pgSQL Functions & Triggers
- `wm_current_role()`, `wm_is_admin()`, `wm_is_super_admin()`, `wm_is_hr()`, `wm_head_gender()`, `wm_actor_qr_section()`, `wm_actor_can_scan_qr()`, `wm_can_view_confidential_medical()` (`SECURITY DEFINER` RLS helpers).
- `trg_wm_profiles_protect_privileges`: Blocks client privilege escalation, self-promotion, or Super Admin mutation.
- `wm_applications_before_write`: Locks non-admin updates strictly to Stage 1 recommendation columns when `OLD.status = 'pending'`.
- `trg_wm_profiles_provision_qr` & `trg_wm_applications_accepted_qr`: Automatically mint/sync `wm_qr_passes`.
- `wm_atomic_qr_checkin`, `wm_atomic_qr_checkout`, `wm_qr_clear_checkout_on_checkin`, `wm_reset_all_qr_attendance`: Transactional row-locked QR attendance engine.
- `wm_mark_email_manually_sent`: Atomic RPC updating `wm_email_manual_confirmations` + `wm_email_deliveries` (`20261121010000`).

### 9.3 Complete 30-Migration Ledger (`supabase/migrations/`)
1. `20261118081558_willow_overhaul_schema_compatibility.sql` — Core tables compatibility alignment.
2. `20261118081745_willow_media_press_head_isolation.sql` — Initial Media vs Press Head RLS isolation.
3. `20261118093000_account_management_and_eb_head_unification.sql` — Privilege protection trigger + `ON DELETE SET NULL` FKs + EB/Head unification.
4. `20261118101500_restrict_head_applications_and_registration.sql` — 4-department Head intake scope + open registration RLS enforcement + medical table isolation.
5. `20261118120000_application_forms_and_storage.sql` — Private `wm-application-files` storage bucket & policies.
6. `20261118143000_willow_core_departments_and_media_press.sql` — Core department seeding & Media/Press alignment.
7. `20261118150000_willow_four_department_application_scope.sql` — Formalizes `media`, `press`, `volunteers`, `security` intake scope.
8. `20261118170000_willow_qr_scanner_system.sql` — `wm_qr_passes`, `wm_qr_scans`, `wm_qr_correction_logs`, pass-provisioning triggers, `wm_atomic_qr_checkin`.
9. `20261118190000_fix_qr_scan_token_fingerprint.sql` — Fixes SHA-256 token fingerprint handling.
10. `20261118193000_increase_willow_application_upload_limit_100mb.sql` — Raises `wm-application-files` limit to `104857600` bytes (100 MiB).
11. `20261119000100_public_wm_department_registration_status_read.sql` — Scopes anonymous `wm_departments` reads.
12. `20261119000200_tighten_qr_helper_access_and_policy.sql` — Hardens `REVOKE`/`GRANT` on QR helper functions & RLS.
13. `20261119120000_willow_qr_check_out_and_reset.sql` — Adds `checked_out_*`, `checkout_count`, `wm_qr_attendance_resets`, `wm_atomic_qr_checkout`, `wm_qr_clear_checkout_on_checkin`.
14. `20261119123000_willow_atomic_attendance_reset.sql` — Adds `wm_reset_all_qr_attendance` Super Admin atomic reset RPC.
15. `20261119150000_restrict_qr_scanners_to_admins_and_security.sql` — Restricts scanner permission to Admin / Super Admin / Security.
16. `20261119153000_make_security_department_scanner_access_unconditional.sql` — Grants unconditional `qr.scan` to active Security department accounts.
17. `20261119170000_hr_nonexpiring_signup_invites.sql` — Adds `wm_hr_signup_invites` non-expiring single-use structure.
18. `20261119180000_public_read_security_registration_status.sql` — Allows public read of `security` registration flag.
19. `20261120100000_keep_hr_signup_tokens_until_claimed.sql` — Retains `token_value` until claimed.
20. `20261120103000_preserve_legacy_hr_signup_links.sql` — Adds `wm_hr_signup_invite_tokens` so old links keep working when resending/re-copying.
21. `20261120120000_add_department_scoped_staff_role.sql` — Adds `staff` role to `wm_profiles.role` check constraint.
22. `20261120120000_simplify_qr_attendance_sync.sql` — Simplifies atomic check-in/check-out sync & duplicate check.
23. `20261120140000_staff_department_rls_and_security_scanner.sql` — Grants `staff` department RLS & Security staff scanner access.
24. `20261121010000_manual_email_mark_sent.sql` — Adds `wm_email_manual_confirmations` + `wm_mark_email_manually_sent` RPC + upgrades `wm_email_deliveries`.
25. `20261122010000_application_legal_consent.sql` — Adds `privacy_policy_accepted`, `terms_accepted`, `legal_consent_version`, `consent_accepted_at`.
26. `20261122020000_department_qr_view_rls.sql` — Adds `wm_actor_qr_section` and department QR view RLS.
27. `20261123010000_super_admin_override_audit.sql` — Adds `wm_application_decision_overrides` + Super Admin RLS.
28. `20261124010000_super_admin_spoof_audit.sql` — Adds `is_spoof`, `previous_decision_by*`, `spoofed_decision_by*` audit columns.
29. `20261124020000_clean_legacy_spoof_attribution_names.sql` — Strips legacy parenthetical attribution tags from `decision_by_name`.
30. `20261124030000_restrict_head_pending_applications_only.sql` — Enforces strict pending-only visibility & write freeze for Heads in RLS + `wm_applications_before_write`.

---

## 10. Backend Edge Functions Contract Summary

| Edge Function | Caller Auth | Actions Supported | CORS Policy |
|---|---|---|---|
| `willow-applications` (`1403` lines + `policy.ts`) | Public (`init_upload`, `submit`); Bearer JWT for admin/head/HR actions | `init_upload`, `submit`, `list`, `list_recommended`, `hr_accepted`, `recommend`, `update`, `override_decision`, `list_spoof_admins`, `spoof_decision`, `list_spoof_audit`, `mark_email_sent`, `list_manual_email_confirmations`, `sign_attachment` | Wildcard `*` |
| `willow-qr` (`1456` lines) | Bearer JWT (`is_active = true`) | `my_context`, `my_pass`, `list_registry`, `department_passes`, `scan_check_in`, `scan_check_out`, `manual_correct`, `reset_all_attendance`, `recent_scans`, `export_csv`, `revoke_pass`, `reissue_pass` | Wildcard `*` |
| `willow-staff-admin` (`522` lines) | Bearer JWT (`super_admin` + `is_active` ONLY) | `list`, `create`, `update`, `update_eb_roster`, `delete_eb_roster`, `create_eb_invite`, `suspend`, `reactivate`, `reset_password`, `send_setup_link`, `resend_invite`, `delete` | Wildcard `*` |
| `willow-eb-signup` (`95` lines) | Unauthenticated (allowlist + origin gated) | `POST { email, password }` | Strict 3-origin allowlist (`403` otherwise) |
| `willow-hr-signup` (`166` lines) | Bearer JWT (`admin`/`super_admin`/`hr` for `create_invite`); Public token for `signup` | `create_invite`, `signup` | Wildcard `*` |
| `willow-committees` (`122` lines) | Public (`list_public`); Bearer JWT (`admin`/`super_admin`/DCC for management) | `list_public`, `list`, `upsert`, `delete` | Wildcard `*` |
| `willow-instagram` (`161` lines) | Public | `GET`/`POST` Graph API proxy (`INSTAGRAM_ACCESS_TOKEN`, 5.5s timeout, safe unconfigured fallback) | Wildcard `*` |
| `willow-application-email` *(unbundled)* | Bearer JWT (Admin/HR) | `{ application_id, decision, force_resend? }` | External |
| `willow-email-management` *(unbundled)* | Bearer JWT (Admin/HR) | `{ action: 'dashboard' | 'retry' | 'save_template', ... }` | External |

---

## 11. End-to-End Critical Workflow Maps

### Workflow A: Public Application Submission -> Signed Upload -> Medical Isolation
```
[Public Visitor on /#apply (ApplySection)]
  └─> polls wm_departments.registration_open every 30s
  └─> attaches file in ApplicationFileUploader
        └─> POST willow-applications { action: "init_upload", application_type, file_name, mime_type }
              └─> checks wm_departments.registration_open === true
              └─> storage.from('wm-application-files').createSignedUploadUrl(path)
        └─> browser PUTs binary directly to signed URL (fallback: inline base64 data URL)
  └─> checks Privacy Policy & Terms checkboxes + fills optional medical disclosure -> Submit
        └─> POST willow-applications { action: "submit", ..., privacy_policy_accepted: true, terms_accepted: true }
              ├─> verifies department open & pending-duplicate guard (409 on duplicate)
              ├─> inserts non-medical row into wm_applications (with WM-XXXX code)
              └─> inserts medical row into wm_application_medical (deletes app row on failure)
```

### Workflow B: Head Pending-Only Review -> Admin Final Decision -> Immediate Disappearance
```
[Department Head on /head/applications (HeadApplicationsView)]
  └─> POST willow-applications { action: "list" } (repeats every 12s + focus/visibility)
        └─> policy.ts: resolveHeadContext() -> filters pending + dept + Media/Press + gender
        └─> redactApplicationForHead() nulls decision_by*, decision_at, notes; medical omitted
  └─> Head clicks Recommend Accept / Reject
        └─> POST willow-applications { action: "recommend", id, recommendation, head_notes }
              └─> checks scope first (403), then status === 'pending' (409 generic if decided)
              └─> updates head_recommendation, head_notes, recommended_by*, recommended_at

[Admin/Super Admin on /admin/recommendations or /admin/applications]
  └─> POST willow-applications { action: "update", id, status: "accepted" | "rejected", review_notes }
        └─> optimistic lock (.eq('status', existing.status).eq('decision_by', ...))
        └─> if accepted -> upserts active pass into wm_qr_passes (also mirrored by DB trigger)
        └─> Next Head poll / RLS read excludes application immediately; notifications strip decision events
```

### Workflow C: Super Admin Spoof vs Super Admin Override
```
[Super Admin Override (/admin/applications or /admin/recommendations -> OverrideDecisionModal)]
  └─> requires reason >= 8 chars
  └─> POST willow-applications { action: "override_decision", id, status, reason }
        ├─> sets decision_by = superAdmin.id, decision_by_name = superAdmin.name
        ├─> logs wm_application_decision_overrides (is_spoof = false)
        └─> updates wm_qr_passes.active (true if accepted, false otherwise)
  └─> AdminStoreContext invokes willow-application-email (if accepted/rejected)

[Super Admin Spoof (/super-admin/spoof -> SpoofModal)]
  └─> POST willow-applications { action: "list_spoof_admins" } -> active admin/super_admin list
  └─> picks target status (accepted/rejected/waitlisted/pending) + attributed Admin
  └─> POST willow-applications { action: "spoof_decision", id, status, attributed_admin_id, notes }
        ├─> sets decision_by / decision_by_name to selected Admin (or null if pending)
        ├─> logs wm_application_decision_overrides (is_spoof = true, true actor + previous + spoofed)
        ├─> updates wm_qr_passes.active
        └─> DOES NOT invoke willow-application-email; public labels show only "<Decision> by <Admin>"
```

### Workflow D: Failed Email -> Gmail Compose Fallback -> Mark as Sent
```
[HR / Admin on EmailsDashboardView -> Failed to Send tab]
  └─> merges server wm_email_deliveries + wm_email_manual_confirmations + localStorage (wm_failed_emails_v1)
  └─> Clicks "Open in Gmail"
        ├─> synchronously calls window.open('', '_blank')
        ├─> if accepted & missing link -> POST willow-hr-signup { action: "create_invite", application_id }
        ├─> navigates popup to https://mail.google.com/mail/?view=cm&fs=1&to=...&su=...&body=...
        └─> saves opened timestamp locally (row remains in Failed to Send)
  └─> Admin sends in Gmail -> returns & clicks "Mark as Sent" -> Confirms
        └─> POST willow-applications { action: "mark_email_sent", ... }
              (fallback RPC wm_mark_email_manually_sent -> fallback RLS upsert)
              ├─> upserts wm_email_manual_confirmations
              └─> upgrades existing wm_email_deliveries row to status='sent', delivery_method='manual_gmail'
        └─> clears local failure cache -> row appears in Email History as "Manual via Gmail"
```

### Workflow E: Atomic QR Check-In / Check-Out & Multi-Scanner Sync
```
[Security / Admin on LiveQrScannerWorkspace]
  └─> BarcodeDetector / jsQR / manual input captures WMQR-* token
  └─> POST willow-qr { action: "scan_check_in" | "scan_check_out", qr_token, gate }
        ├─> SHA-256 hashes token -> calls wm_atomic_qr_checkin / wm_atomic_qr_checkout (FOR UPDATE lock)
        ├─> Check-In duplicate? -> preserves original checked_in_at, logs already_checked_in, returns duplicate warning
        ├─> Check-Out repeat (>=1 prior)? -> returns checkout_warning unless confirm_repeat: true
        └─> Success -> commits pass & scan log, updates local Checked In / Not Checked In split lists immediately
  └─> Broadcasts sync signal via BroadcastChannel + Supabase Realtime + 4s polling across all active terminals
```

---

## 12. Security, Error Handling & UX Architecture

### 12.1 Defense-in-Depth Controls
- **Four-layer RBAC enforcement**: UI route & component guards (`AdminRouter`, `ExecutivePortal`, `DepartmentHeadPortal`, `hasPermission`) -> Edge Function JWT + `wm_profiles.is_active` verification -> PostgreSQL RLS (`USING`/`WITH CHECK`) -> `BEFORE` triggers (`trg_wm_profiles_protect_privileges`, `wm_applications_before_write`).
- **Confidential Data & Signed Media**: Private `wm-application-files` bucket never uses permanent public URLs; Edge Function generates short-lived signed URLs (`createSignedUrl`) after verifying department/gender/pending-scope access. Medical disclosures live in `wm_application_medical` and are stripped unless `applications.view_confidential` is held by an active `admin`/`super_admin`.
- **Token Security**: QR tokens (`WMQR-*`) and HR signup tokens (64-hex) are indexed by SHA-256 digest (`token_hash`).

### 12.2 User Experience, Loading, & Resilience Patterns
- **Error Boundaries (`src/App.tsx`, `src/components/admin/PortalErrorBoundary.tsx`)**: Global and portal-level React error boundaries reset on route changes (`resetKey={pathname}`), clean up intro body classes, and offer recovery navigation/reload/sign-out actions.
- **Loading & Feedback**: `WmSkeleton` renders table/card/dossier loading placeholders; `ToastViewport` renders queued status/error/warning toasts; `ConfirmDialog` guards destructive operations (account deletions, manual sent confirmations, resets).
- **Responsive Shell (`AdminShell.tsx`)**: Fixed desktop sidebar (`17.5rem`) + sticky header + slide-over accessible mobile drawer (`Escape` handler, body scroll lock, focus management, skip-to-content link).

---

## 13. Critical Implementation Details & Architectural Quirks (Migration Reference)

1. **Hybrid Server + `localStorage` Split**: When porting this architecture to a new system, note that Website CMS, Custom Form Builder, Operations (`teams`/`shifts`/`workspace`), Notifications, and `recordSecurityViolation` audit logs are strictly `localStorage`-only (`willow_mun_platform_snapshot_v5`) and do not persist to PostgreSQL.
2. **External Unbundled Email Functions**: `willow-application-email` and `willow-email-management` are invoked by name via `supabase.functions.invoke` and manage `wm_email_deliveries` + templates, but their source code is not inside `supabase/functions/`. Any clean reimplementation must supply both functions and `wm_email_deliveries` / template tables.
3. **`westPortalSections` Route Shadowing (`ExecutivePortal.tsx`)**: Several legacy/CMS branches (`logs`, `monitoring`, `roles`, `permission-defs`, `forms`, `delegates`, `teams`, `shifts`, `deployment`, `email`, `notifications`, `registration`, `website-editor` sub-modes `pages`/`sections`/`media`/`navigation`/`seo`/`versions`, `gallery`) remain wired inside JSX conditionals and `SECTION_META`, yet are omitted from the `westPortalSections` whitelist, causing `Access Restricted` if visited directly.
4. **Department Testing Mode Auth Boundary**: `testModeHeadUser` impersonates the Head's identity only in client state (`AdminStoreContext`) and client filtering (`HeadApplicationsView`); API calls continue sending the Super Admin's JWT. Server-side impersonation would require scoped token exchange.
5. **QR Pass Deactivation Asymmetry**: `willow-applications` deactivates `wm_qr_passes` (`active = false`) when `override_decision` or `spoof_decision` moves an applicant away from `accepted`, whereas standard `update` only inserts/activates on `accepted` and does not explicitly deactivate on reversal.
6. **EB Invite URL vs Endpoint Contract**: `willow-staff-admin` `create_eb_invite` returns a URL targeting the `willow-eb-signup` function endpoint with `?token=...&email=...`, while `willow-eb-signup` only handles `POST` JSON `{ email, password }` from the allowlisted origins (`/eb-signup` page). Meanwhile `willow-eb-signup`'s strict 3-origin CORS allowlist will block any new deployment domain unless updated.
7. **`DepartmentQrSectionView` vs `willow-qr` Role Mismatch**: SQL helper `wm_actor_qr_section` permits `staff` to view their own department QR section, while `willow-qr` `department_passes` rejects `role === 'staff'` (allowing only `department_head`, `executive_board`, `admin`, `super_admin`).
8. **Duplicate Migration Timestamp Prefix**: Two migrations share prefix `20261120120000` (`add_department_scoped_staff_role.sql` and `simplify_qr_attendance_sync.sql`), which remain compatible because they touch disjoint objects (`wm_profiles` vs `wm_qr_passes`).
