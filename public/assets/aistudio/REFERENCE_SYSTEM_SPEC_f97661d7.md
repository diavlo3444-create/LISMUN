# WEST MUN 2027 — Reference System Technical Specification

**Audit Scope:** Complete, code-verified architectural and behavioral specification of the WEST MUN 2027 conference management platform (Frontend SPA, Express/Vercel Serverless Backend, Supabase Edge Functions, PostgreSQL Schema/Triggers/RLS, Authentication, Invitations, and Email Infrastructure).  
**Security Redaction Notice:** All credentials, API keys, service-role secrets, encryption keys, personal emails, test-account emails, project identifiers, and real user identifiers are omitted or replaced with placeholders (`<PRIMARY_SUPER_ADMIN_EMAIL>`, `<SUPABASE_PROJECT_REF>`, `<SITE_URL>`, etc.).

---

## Table of Contents

1. [System Architecture & Technology Stack](#1-system-architecture--technology-stack)
2. [Authentication, Roles & Access Control Model](#2-authentication-roles--access-control-model)
3. [Public Conference Portal & Application Ingestion](#3-public-conference-portal--application-ingestion)
4. [Admin Panel Specification (`/admin`)](#4-admin-panel-specification-admin)
5. [Head Portal Specification (`/head`)](#5-head-portal-specification-head)
6. [Executive Board (`/eb`), Team Member Portals & QR Access (`/pass`, `/scanner`)](#6-executive-board-eb-team-member-portals--qr-access-pass-scanner)
7. [Invitation & Account Onboarding System](#7-invitation--account-onboarding-system)
8. [Email & Messaging Infrastructure](#8-email--messaging-infrastructure)
9. [Backend APIs & Edge Functions Inventory](#9-backend-apis--edge-functions-inventory)
10. [Database Architecture, Triggers, Functions & RLS](#10-database-architecture-triggers-functions--rls)
11. [Security Controls, Audit Logging & UX Patterns](#11-security-controls-audit-logging--ux-patterns)
12. [Complete End-to-End Workflow Map](#12-complete-end-to-end-workflow-map)
13. [Important Implementation Details, Edge Cases & Observed Discrepancies](#13-important-implementation-details-edge-cases--observed-discrepancies)

---

## 1. System Architecture & Technology Stack

### 1.1 High-Level Topology

```text
+-------------------------------------------------------------------------+
|                           Browser SPA (React 19 + Vite)                 |
|  Code-split route loader in src/main.tsx:                               |
|  Public (/), Preview (/preview), Login (/login), Team (/volunteer|      |
|  /media|/security|/team-members), Head (/head/*), Admin (/admin/*),     |
|  EB (/eb, /eb-signup), Team Signup (/signup), QR (/pass, /scanner)      |
+------+-------------------------------+----------------------------------+
       |                               |
       | Direct PostgREST + Auth +     | Privileged Actions (Bearer JWT)
       | Storage (Anon Key + RLS)      |
       v                               v
+--------------------------+   +------------------------------------------+
|   Supabase Platform      |   |   Two Server Tiers                       |
|  - Supabase Auth (JWT)   |   |  A) Supabase Edge Functions (Deno, 9 fns)|
|  - PostgreSQL + RLS      |   |     Uses SUPABASE_SERVICE_ROLE_KEY       |
|  - Storage Buckets:      |   |  B) Node/Vercel API Routes (/api/*)      |
|    `site-files`          |   |     Express dev (`server.ts`) / Vercel   |
|    `registration-extra`  |   |     (`api/*.js` -> `serverless/*.ts`)    |
+--------------------------+   +------------------------------------------+
                                       |
                        +--------------+--------------+
                        |                             |
                        v                             v
             +--------------------+        +--------------------+
             | Google OAuth2 +    |        | Resend HTTP API    |
             | Gmail REST API     |        | (`hr-bulk-email`)  |
             +--------------------+        +--------------------+
```

### 1.2 Stack & Configuration
- **Frontend:** React 19, TypeScript, Vite (code-split per top-level route in `src/main.tsx` so public visitors never download `/admin` or `/head` bundles), Tailwind CSS (`@import "tailwindcss";`), self-hosted `@fontsource` typography (`Cinzel`, `Cormorant Garamond`, `Plus Jakarta Sans`), Three.js/canvas diplomatic globe & particle intros, `libphonenumber-js` for international E.164 phone parsing, QR rendering/scanning libraries in `/pass` and `/scanner`.
- **Dual-Mode Server Runtime:**
  - **Local Dev:** `server.ts` runs Express on port `3000` with Vite middleware and routes `/api/super-admin`, `/api/head-auth`, `/api/qr-access`, and local JSON fallbacks (`/api/health`, `/api/contact`, `/api/register`, `/api/team-register`, `/api/admin/login|data|logout` in `api/local-routes.ts`).
  - **Production Hosting (`vercel.json`):** Static SPA rewrite `"/((?!api/|assets/|.*\\..*).*)" -> "/index.html"`, Vercel Serverless functions under `api/*.js` (wrapping `serverless/*.ts` with `maxDuration: 30`), plus strict CSP (`default-src 'self'`, `connect-src 'self' https://*.supabase.co`, `frame-ancestors 'self'`), HSTS, `Permissions-Policy: camera=(self)` (required for `/scanner`), and `X-Robots-Tag: noindex, nofollow` on `/admin(.*)`.
- **Security Checks:** `scripts/security-check.ts` static check script in repo.

---

## 2. Authentication, Roles & Access Control Model

### 2.1 Actor Hierarchy & Authority Resolution
Authorization is **database-authoritative** and **server-verified**. Client `app_metadata` flags alone never authorize Admin, Super Admin, or Department Head privileges inside Postgres RLS or privileged backend handlers.

| Actor Tier | Source of Truth | Scope & Privileges | Primary Routes |
|---|---|---|---|
| **Public / Anonymous** | `anon` Postgres role | Read published CMS tables + `settings` + open `wm_registration_windows`; `INSERT` only (restricted columns) into `delegates`, `team_registrations`, `wm_chair_applications`, `inquiries`; upload portfolio images to `registration-extra`. | `/`, `/terms`, `/privacy`, `/copyright`, `/media-consent`, `/code-of-conduct` |
| **Team Member (Accepted Staff)** | `auth.users.app_metadata` (`wm_role='team_member'`, `wm_team`, `wm_section`, `wm_registration_id`) + `team_registrations` (`status='accepted'`) + `wm_people` / `wm_team_group_members` / `wm_shift_assignments` / `wm_eb_shift_assignments` | Read own team group assignments (`wm_team_groups`), own shifts (`wm_shifts`, `wm_eb_shifts`), own department positions & assigned `department_tasks`, plus personal QR pass (`wm-qr-access`). **No admin/head mutation rights.** Security team members can access `/scanner`. | `/login`, `/signup`, `/team-members`, `/volunteer`, `/media`, `/security`, `/pass`, (`/scanner` if security) |
| **EB Non-Head (`co_head`, `designer`, `marketing`)** | `auth.users.app_metadata` (`wm_role='eb_member'`, `wm_eb_role`, `wm_team`, `wm_section`, `wm_reporting_head_id`) + active row in `wm_qr_passes` | Shared EB Operations Dashboard (`/eb`) with role-specific landing overview (`CoHeadCommandView`, `DesignStudioView`, `MarketingCampaignView`). Can view published/assigned EB shifts, submit swap requests, update own `wm_eb_tasks`, add task comments, acknowledge announcements, report incidents. **Co-Heads** additionally manage department `wm_eb_tasks` & `wm_eb_shifts` (via `is_eb_department_manager()`), review swap requests, and **Security Co-Heads only** can scan QR passes (`is_security_scanner_authorized()`). | `/eb-signup`, `/eb`, `/login`, `/pass`, (`/scanner` for security `co_head` only) |
| **Department Head (11 Departments)** | Active row in `public.department_heads` (`active = true`, `user_id = auth.uid()`) | Strictly scoped to `department_heads.department` and (for `media_press`, `security`, `volunteers`) `department_heads.section` (`'male' | 'female'`). Specialized workspace depends on department (see Section 5). Cannot access `/admin`, cannot alter global settings (except **DCC Head** limited to delegate committee/registration window keys), cannot create heads or admins. | `/head/*`, `/eb`, `/pass`, (`/scanner` if `security` head) |
| **Regular Admin** | Active row in `public.admins` (`active = true`, `role = 'admin'`) | Full access to `/admin` tabs (Website Editor, Committees, Schedule, Secretariat, Announcements, Documents, FAQ, Sponsors, Registrations, Chair Apps, Executive Board, Statistics, Inquiries, Settings, Team/Staffing review). **Cannot** manage `/admins`, **cannot** manage `/heads` (unless Super Admin), **cannot** launch Super IT Test Mode, **cannot** hard-delete delegate/team applications via `delete-application`, **cannot** delete EB members via `wm-eb-access`. | `/admin/*`, `/admin/eb-invites`, `/eb`, `/pass`, `/scanner` |
| **Primary Super Admin (IT Super Admin)** | `public.admins` (`role = 'super_admin'`, `active = true`) **OR** authenticated email === `<PRIMARY_SUPER_ADMIN_EMAIL>` | Unrestricted authority: manage Normal Admins (`/api/super-admin?scope=admins`), create/edit/reset/delete Department Heads (`/api/super-admin`), hard-delete applications (`delete-application`), delete EB member accounts (`wm-eb-access` `delete_member`), operate **Super IT Test Mode** (impersonate any department/section inside `/head` via HMAC-signed session tokens with audit log), bypass operational restrictions via `wm_private.is_super_admin()`. | `/admin/*`, `/head/*` (via Test Mode), `/eb`, `/pass`, `/scanner` |

### 2.2 Detailed Authentication & Session Mechanisms

#### Feature: Standard Login (`/login` & `/head` login)
- **What it does:** Authenticates existing Staff, EB Members, Department Heads, and Admins via Supabase Auth email/password, resolves their effective portal role from server/DB truth, and redirects or unlocks the matching workspace.
- **How the user interacts with it:** Enters email + password on `/login` (`LoginPage.tsx`), `/head` (`HeadLogin.tsx`), `/admin` (`AdminApp.tsx` login screen), or `/team-members` (`TeamMemberPortal.tsx`).
- **Components:** `src/pages/LoginPage.tsx`, `src/head/HeadLogin.tsx`, `src/admin/AdminApp.tsx`, `src/team/TeamMemberPortal.tsx`, `src/dashboard/DashboardShell.tsx`.
- **Backend functions:**
  - Direct Supabase Auth `supabase.auth.signInWithPassword({ email, password })`.
  - Role resolution chain post-login:
    1. `GET /api/super-admin?action=session` -> `verifyAdminCaller()` (verifies JWT via `SUPABASE_SERVICE_ROLE_KEY`, checks `admins` table and `<PRIMARY_SUPER_ADMIN_EMAIL>`).
    2. `public.department_heads` query (`user_id = auth.uid()` and `active = true`).
    3. `user.app_metadata.wm_role` (`team_member`, `eb_member`) + `POST /functions/v1/wm-qr-access` (`action: 'access'`) to verify active EB pass or team assignment.
  - Legacy local-dev fallback (`/api/head-auth` -> `HeadStore` file-backed PBKDF2-HMAC-SHA512 / SHA256 session store in `src/server/headStore.ts`): **explicitly disabled on Vercel (`process.env.VERCEL || process.env.VERCEL_ENV` returns `503 USE_SUPABASE_AUTH`)**.
- **Database structures:** `auth.users`, `public.admins`, `public.department_heads`, `public.wm_qr_passes`, `public.team_registrations`.
- **Permissions required:** Valid Supabase Auth account; specific portal entry requires corresponding active DB row or verified `app_metadata`.
- **Success & failure scenarios:**
  - *Success:* Session JWT stored by Supabase JS client; `/login` redirects Admins -> `/admin`, Heads -> `/head`, EB members -> `/eb`, Security team members -> `/security`, Media -> `/media`, Volunteers -> `/volunteer`.
  - *Failure:* Wrong credentials display inline error; valid Supabase login with no active `admins`, `department_heads`, `wm_eb`/pass, or `accepted` team record shows Access Denied / unassigned state and blocks portal access. Rate limits / network errors show safe retry messages.

#### Feature: Super IT Test Mode ("Login as Head" Impersonation)
- **What it does:** Allows `<PRIMARY_SUPER_ADMIN_EMAIL>` (or verified Super Admin caller) to launch a time-bounded, audited Head Portal test session for any of the 11 departments (and `'male'`/`'female'` section) without mutating real head passwords or signing out of Supabase.
- **How the user interacts with it:** In `/admin` -> **Super Admin Control** (`SuperAdminManager.tsx`), selects Department + Section -> clicks **Launch Test Session**. A 1-time launch ticket URL `/head?test_ticket=<ticket>` opens in a new tab or navigates directly, displaying a gold "Super IT Test Mode" banner in `/head` with an **Exit Test Mode** control.
- **Components:** `src/admin/SuperAdminManager.tsx`, `src/head/HeadPortal.tsx`, `src/head/HeadOverview.tsx`, `src/head/HeadRegistrations.tsx`, `src/head/DepartmentWorkspace.tsx`, `src/head/services/departmentStore.ts`, `src/head/services/operationsStore.ts`.
- **Backend functions (`serverless/super-admin.ts` -> `src/server/superAdminHandler.ts`, `departmentRecordsAdmin.ts`, `operationsAdmin.ts`):**
  - `action=launch-test` (`handleCreateTestSession`): verifies Super Admin JWT -> issues single-use ticket (`launchTickets` in-memory map, TTL short-lived, bound to HMAC-SHA256 `TestSessionRecord`).
  - `action=consume-ticket` (`handleConsumeLaunchTicket`): exchanges 1-time ticket for signed `sessionToken` (`signTestSessionToken`, HMAC-SHA256 using `TEST_TOKEN_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` fallback, 2h TTL). Stored in `sessionStorage` (`westmun_super_test_session`).
  - `action=verify-test-session` (`handleVerifyTestSession`): validates signature + expiry (`verifySignedTestToken` survives serverless cold starts because payload + HMAC are self-contained!).
  - `action=terminate-test-session` (`handleTerminateTestSession`): logs exit to `auditLog` and invalidates in-memory record if present.
  - Proxy data/mutation endpoints while in Test Mode: `action=test-data`, `action=test-update`, `action=test-records`, `action=test-record-save`, `action=test-record-delete`, `action=operations|ops|test-operations|wm_ops_*`.
- **Database structures:** Reads/writes `team_registrations`, `wm_staffing_decisions`, `department_records`, `wm_people`, `wm_projects`, `wm_shifts`, `wm_shift_assignments`, `wm_team_groups`, `wm_team_group_members`, `wm_registration_windows` via server `service_role` client, strictly clamped to the test session's `department` & `section`.
- **Permissions required:** Exclusive to `verifySuperAdminCaller` (`<PRIMARY_SUPER_ADMIN_EMAIL>`). Regular admins and heads receive `403`.
- **Success & failure scenarios:**
  - *Success:* Renders exact Head Portal UX for target department/section with server-enforced scoping and in-memory audit trail (`recordTestAuditLog`).
  - *Failure:* Expired/forged tokens fail `crypto.timingSafeEqual` HMAC check -> `401` -> Head Portal exits test mode and returns to normal auth check.
  - *Note on `RolesDashboard` / HR / PR / DCC during Test Mode:* See Section 13.4 for features that query Supabase directly vs using the `/api/super-admin` test-mode proxy.

---

## 3. Public Conference Portal & Application Ingestion

### 3.1 Public Site, CMS & Live Visual Editor Preview (`/`, `/preview`)
- **What it does:** Renders the full multi-section diplomatic conference showcase (`OpeningIntro`, `Navbar`, `Hero`, `DiplomaticGlobe`, `AnnouncementsSection`, `ConferenceIntro`, `ConferenceHighlights`, `AboutSection`, `CommitteesSection`, `ScheduleSection`, `SecretariatSection`, `DocumentsSection`, `RegistrationSection`, `SponsorsSection`, `ExperienceSection`, `CustomSectionsRenderer`, `Footer`) plus legal subpages (`/terms`, `/privacy`, `/copyright`, `/media-consent`, `/code-of-conduct`).
- **How the user interacts with it:** Browses public conference info, expands committee dossiers, searches FAQs, downloads public documents, and opens registration/contact modals. When opened inside `/admin` -> **Website Editor** (`/?preview=1` or `/preview`), bypasses `OpeningIntro`, listens for `postMessage` (`WESTMUN_CMS_PREVIEW_UPDATE`, `WESTMUN_CMS_PREVIEW_SCROLL`) and `localStorage`/`sessionStorage` key `westmun_cms_draft_preview` to live-render unsaved CMS edits in Desktop/Tablet/Mobile viewports.
- **Components:** `src/App.tsx`, `src/lib/cmsContent.ts`, `src/lib/cmsRegistry.ts`, `src/lib/content.ts`, `src/components/*`.
- **Backend / Database:** Public `SELECT` on `public.settings`, `public.secretariat`, `public.committees`, `public.schedule_days`, `public.schedule_sessions`, `public.faq`, `public.documents`, `public.sponsors`, `public.announcements` (only `published = true`; announcements also require `published_at <= now()`).

### 3.2 Registration Portals (`RegistrationSection.tsx`)
All public submission forms share three hard defenses:
1. **Hidden Honeypot Field (`website`)**: If populated by bots, UI immediately shows success without executing any network/DB request.
2. **Database `BEFORE INSERT` Guard Triggers**: Ignore client-supplied `status`, `payment_status`, `fee_amount`, `admin_notes`, `created_at`, `consent_at`; validate open/closed switches in `public.settings` / `wm_registration_windows`; enforce per-minute global flood caps (`P0001: rate_limited`).
3. **Column-Level SQL `GRANT INSERT (...)`**: Limits `anon`/`authenticated` to non-privileged input columns only.

#### Feature A: Delegate Registration (`RegistrationForm.tsx`)
- **What it does:** Submits individual (`single_delegate`) or school (`school_delegation`) applications for `early_bird` or `regular` tiers.
- **How the user interacts with it:** Clicks Delegate Register CTA -> checks live tier state (`tier_state('early_bird'|'regular')`) and fee (`tier_fee`) -> fills full name, email, institution, delegation type, age confirmation (14+ / parental consent), and policy checkbox (`consent_version`) -> submits.
- **Components:** `src/components/RegistrationSection.tsx`, `src/components/RegistrationForm.tsx`, `src/lib/registration.ts`.
- **Backend / Fallback:** Direct `supabase.from('delegates').insert(...)`. If direct Supabase fails unexpectedly, `src/lib/api.ts` exposes `/api/register` local fallback (dev only).
- **Database:** `public.delegates`, guarded by `delegates_guard_trg` (`tier_state()` check, `tier_fee()` calculation, max 20/min flood cap, unique index on `(lower(email), tier)`).
- **Permissions:** `anon` / `authenticated` `INSERT` on 7 whitelisted columns (`full_name`, `email`, `institution`, `tier`, `delegation_type`, `age_confirmed`, `consent_version`).
- **Success & failure:** Success shows confirmation reference; duplicate `(lower(email), tier)` (`23505`), closed window (`registration_closed` / `not_yet` / `ended`), or flood cap (`rate_limited`) maps to human-readable errors.

#### Feature B: Chair Application (`ChairApplicationModal.tsx`)
- **What it does:** Submits Executive Dais / Committee Chair applications when `chair_registration_open` / `team_chair_open` allows.
- **How the user interacts with it:** Opens Chair Application modal -> enters personal details, institution, committee preferences, MUN chairing experience, essay/statement, age & consent -> submits.
- **Components:** `src/components/ChairApplicationModal.tsx`.
- **Database:** `public.wm_chair_applications` (inserted via Supabase; read by Admins in `ChairApplicationsManager` and HR Heads in `HrApplicantHub`).
- **Success & failure:** Saves application as `received`; rejects duplicate/invalid inputs with inline validation.

#### Feature C: Staff / Team Member Application (`TeamRegistrationModal.tsx`)
- **What it does:** Multi-step recruitment wizard for `security`, `media`, and `volunteers` teams (with `male` / `female` section selection). Also supports department-specific open/closed checks (`settings.team_<dept>_open` AND `wm_registration_windows`).
- **How the user interacts with it:**
  - **Step 1:** Choose team (`security`, `media`, `volunteers`), section (`male`, `female`), Full Name, Email, Institution, Applicant Phone + Emergency Contact / Guardian Phone (`InternationalPhoneInput.tsx` via `libphonenumber-js`, default `SA`).
  - **Step 2:** Prior experience & statement.
  - **Step 3 (Department-Specific Assessments):**
    - *Security (`securityQuestions.ts`):* 4 mandatory scenario essay questions with live word counters and strict minimums (**Emergency Problem-Solving >= 80 words**, **Teamwork >= 50 words**, **Motivation >= 50 words**, **Handling Bullying/Harassment >= 50 words**).
    - *Volunteers (`volunteerQuestions.ts`):* 4 mandatory scenario responses (`>= 1 word` each: special skills, teamwork conflict, emergency reaction, delegate professionalism).
    - *Media:* 5 photography/design/social-media questions + valid `http(s)://` portfolio URL + optional portfolio/work image uploads to `registration-extra` storage bucket (up to 200 MB; paths embedded in `statement` inside `[EXTRA_PHOTOS]...[/EXTRA_PHOTOS]` markers).
  - **Step 4:** Age confirmation & legal consent -> submit.
  - Drafts auto-save to `sessionStorage` (`westmun_team_application_draft`).
- **Components:** `src/components/TeamRegistrationModal.tsx`, `src/components/InternationalPhoneInput.tsx`, `src/lib/securityQuestions.ts`, `src/lib/volunteerQuestions.ts`.
- **Backend / Fallback:**
  1. Direct insert to `public.team_registrations` with full profile + assessment columns (plus formatted profile/Q&A blocks prepended to `statement` for backward compatibility).
  2. If PostgREST returns missing-column error (`PGRST204` / `42703` / column privilege error), automatically retries with core legacy column subset.
  3. If Supabase fails, falls back to `POST /api/team-register` (`api/local-routes.ts`), which also enforces Security word counts (`80/50/50/50`) server-side.
- **Database:** `public.team_registrations`, guarded by `team_registrations_guard_trg` (`migration_volunteer_team_questions.sql`): checks `settings.team_<team>_open = 'true'`, enforces Security 80/50/50/50 word counts (`public.word_count()`) and Volunteer non-empty answers (`P0001`), enforces max 20/min flood cap, unique index `(lower(email), team)`.
- **Success & failure:** Shows submission confirmation and clears `sessionStorage` draft; surfaces exact word-count deficit or duplicate application message if rejected.

#### Feature D: Contact Inquiry (`ContactSection.tsx`)
- **What it does:** Captures public Secretariat contact messages.
- **Components:** `src/components/ContactSection.tsx`.
- **Database:** `public.inquiries` guarded by `inquiries_guard_trg` (forces `status = 'new'`, strips `admin_notes`, enforces max 10/min flood cap).

---

## 4. Admin Panel Specification (`/admin`)

Implemented in `src/admin/AdminApp.tsx` using shared `DashboardShell` (`src/dashboard/DashboardShell.tsx`). All tabs require an active row in `public.admins`; **Admins** and **Super Admin** tabs are hidden and server-blocked unless `isSuperAdmin === true`.

### 4.1 Dashboard Overview & Statistics
- **Components:** `src/admin/DashboardOverview.tsx`, `src/admin/StatisticsReports.tsx`.
- **What it does:** Real-time metrics (total delegates, paid vs unpaid revenue estimates, team applicants by department/section, chair applications, unread inquiries, check-in presence overview, and CSV export / printable summary reports).
- **Database:** Reads `delegates`, `team_registrations`, `wm_chair_applications`, `inquiries`, `wm_staffing_decisions`, `department_heads`, `committees`.
- **Permissions:** Active Admin (`public.is_admin()`).

### 4.2 Website & Public Content Management
- **Tabs & Components:**
  - **Website Editor** (`src/admin/WebsiteEditor.tsx`): Live visual CMS editor for `DEFAULT_CMS_CONTENT` sections stored in `public.settings` (JSON/string keys defined in `src/lib/cmsRegistry.ts`), custom sections CRUD, embedded `/preview` iframe with Desktop/Tablet/Mobile toggles, `postMessage` live sync, scroll-to-section, draft export/import, and revision history rollback.
  - **Content Manager** (`src/admin/ContentManager.tsx`): CRUD editors for `committees`, `schedule_days`, `schedule_sessions`, `secretariat`, `announcements`, `documents`, `faq`, `sponsors` (`FileUpload.tsx` uploads to `site-files` storage bucket).
  - **Settings Manager** (`src/admin/SettingsManager.tsx`): Master `registration_open`, `early_bird_opens/closes`, `regular_opens/closes`, fees (`fee_early_bird`, `fee_regular`), `team_<dept>_open` switches, `wm_registration_windows` operational toggles, **Gmail OAuth Connection Card** (connect/status/disconnect), and legal metadata.
- **Database:** `public.settings`, `public.committees`, `public.schedule_days`, `public.schedule_sessions`, `public.secretariat`, `public.announcements`, `public.documents`, `public.faq`, `public.sponsors`, `public.wm_registration_windows`, `storage.objects` (`site-files`).
- **Permissions:** `public.is_admin()` (Admins only for writes; public reads published rows).

### 4.3 Registrations, Chairs, Team Decisions & Overrides
- **Tabs & Components:**
  - **Registrations** (`src/admin/RegistrationsManager.tsx`) & **Applications** (`src/admin/ApplicationsManager.tsx`): Unified review of `delegates` and `team_registrations`.
  - **Chair Applications** (`src/admin/ChairApplicationsManager.tsx`): Review, filter, status update (`received`, `under_review`, `accepted`, `waitlisted`, `rejected`, `withdrawn`), notes, and email drafting for `wm_chair_applications`.
  - **Heads / Staffing Oversight** (`src/admin/HeadsManager.tsx`): View Department Head recommendations stored in `public.wm_staffing_decisions` alongside team applications; **Secretariat Override & Finalization** (`admin_decision`: `accepted`/`rejected`/`waitlisted`, `admin_notes`, `admin_reviewed_at`, syncing `team_registrations.status`, `admin_finalized_at`, `admin_finalized_by`).
  - **Inquiries** (`src/admin/InquiriesManager.tsx`): Review/update/archive/delete `public.inquiries`.
- **Key Admin Capabilities vs Department Heads:**
  - Admins can send **Delegate Acceptance Emails** via Gmail OAuth (`gmail-send-acceptance` Edge Function).
  - Admins can **override** any department head recommendation (`wm_staffing_decisions`) or mutate any department's `team_registrations`.
  - **Super Admin Exclusive Hard Delete:** Regular admins cannot permanently delete delegate/team applications if restricted at UI/API; Super Admin invokes `POST /api/super-admin?action=delete-application` (which deletes linked `wm_staffing_decisions` rows first, then the `delegates` or `team_registrations` row via `service_role`).
  - Admins can issue single or batch **Team Member Signup Links** (`team-signup` Edge Function `create` / `create_batch`) for accepted team applicants.
- **Success & failure:** Status updates validate allowed enums; Gmail sending logs errors if OAuth not connected or delegate is not `accepted`.

### 4.4 Executive Board & Account Management
- **Tabs & Components:**
  - **Executive Board Manager** (`src/admin/ExecutiveBoardManager.tsx`) & **EB Invites Page** (`src/admin/EbInviteAdminPage.tsx` at `/admin/eb-invites`):
    - Generates **Reusable Public EB Signup Link** (`wm-eb-access` `create_signup_link`, automatically deactivating any prior active link).
    - Generates **Personal Email-Locked 7-Day EB Invites** (`wm-eb-access` `create_invite`).
    - Lists all active EB members & department heads (`wm-eb-access` `list_members`).
    - **Super Admin only** (`<PRIMARY_SUPER_ADMIN_EMAIL>`): Permanently deletes EB member Auth account + `wm_qr_passes` row (`wm-eb-access` `delete_member`), explicitly refusing deletion if the user also holds an `admins` or `department_heads` record (`409`).
  - **Department Heads Manager** (`src/admin/TeamManagement.tsx` / `SuperAdminManager.tsx` / `HeadsManager`):
    - Lists heads (`GET /api/super-admin`).
    - Creates/invites a new Head Auth user + `department_heads` row (`POST /api/super-admin`). Enforces gender section `'male' | 'female'` for `media_press`, `security`, `volunteers` and unique active head per `(department, section)`.
    - Re-assigns existing Auth user (`POST /api/super-admin?action=assign`), updates active/department/section (`PATCH /api/super-admin`), resets/sends recovery password (`POST /api/super-admin?action=reset-password`), deletes/revokes head (`DELETE /api/super-admin`).
  - **Admin Accounts Manager** (`src/admin/AdminAccountsManager.tsx`):
    - **Super Admin Exclusive** (`scope=admins` on `/api/super-admin`): Lists admins, promotes/creates normal admin (`role: 'admin'`), toggles `active`, or removes admin access (protects `<PRIMARY_SUPER_ADMIN_EMAIL>` from deactivation/deletion).
  - **Super Admin Control** (`src/admin/SuperAdminManager.tsx`):
    - Manages **Super IT Test Mode** launch (select any of 11 departments + section -> opens isolated `/head?test_ticket=...`).

---

## 5. Head Portal Specification (`/head`)

### 5.1 Routing, Shell & Department/Section Isolation
- **Entry Point:** `src/head/HeadPortal.tsx` -> `src/head/HeadLogin.tsx` (if unauthenticated) -> `src/head/DepartmentDashboard.tsx`.
- **Golden Key Unlock UX:** `src/head/GoldenKeyUnlock.tsx` displays an optional brief ceremonial golden-key animation on portal entry.
- **Strict Scoping Mechanism (`src/head/departments.ts`, `src/head/workspaces.ts`):**
  - Identity comes exclusively from `public.department_heads` (`active = true`) matching `auth.uid()` (or signed Test Mode token).
  - **Gender-Separated Departments:** `media_press`, `security`, `volunteers` require `section IN ('male', 'female')` (enforced by `department_heads_section_check` and unique partial index). Heads of these departments only ever see/manage applicants, roles, hierarchy nodes, groups, and shifts matching their `department` AND `section`.
  - **Unsectioned Departments (8):** `design`, `marketing`, `pr`, `hr`, `logistics`, `it`, `ceremonies`, `dcc` have `section = NULL`.
  - **Alias Normalization:** Public forms store `team = 'media'` whereas `department_heads` stores `'media_press'`. Both SQL RLS (`head_department() = 'media_press' and team in ('media', 'media_press')`) and TypeScript helpers (`canonicalTeam`, `normalizeDepartment`) bridge this seamlessly.
  - **Unauthorized / Unassigned:** `src/head/AccessDenied.tsx` blocks authenticated users with no active head row (unless in valid Super IT Test Mode).

### 5.2 Department Capability Matrix & Navigation Tabs

| Department (`slug`) | Overview | Applications Review | Roles & Hierarchy | Custom Groups & Modern Shifts | Legacy Operations / Deployment | Dedicated Domain Module(s) | Scanner (`/scanner`) |
|---|---|---|---|---|---|---|---|
| **Media & Press (`media_press`)** *(male / female)* | `HeadOverview` | Yes (`HeadRegistrations`) | **Yes (`RolesDashboard`)** | **Yes (`GroupManagement`, `ShiftManagement`)** | Legacy `TeamDeploymentPlanner` + `DepartmentWorkspace` | Co-Heads (`HeadCoHeadManagement`), Operations (`OperationsWorkspace`) | No |
| **Security (`security`)** *(male / female)* | `HeadOverview` | Yes (`HeadRegistrations`) | **Yes (`RolesDashboard`)** | **Yes (`GroupManagement`, `ShiftManagement`)** | Legacy `TeamDeploymentPlanner` + `DepartmentWorkspace` (`incident` category) | Co-Heads (`HeadCoHeadManagement`), Operations (`OperationsWorkspace`) | **Yes** |
| **Volunteers (`volunteers`)** *(male / female)* | `HeadOverview` | Yes (`HeadRegistrations`) | **Yes (`RolesDashboard`)** | **Yes (`GroupManagement`, `ShiftManagement`)** | Legacy `TeamDeploymentPlanner` + `DepartmentWorkspace` | Co-Heads (`HeadCoHeadManagement`), Operations (`OperationsWorkspace`) | No |
| **Human Resources (`hr`)** | `HeadOverview` | Read-only via HR Hub (`HrApplicantHub`, `HrAcceptedApplicants`) | No | **Blocked by DB** (`wm_private`) | `DepartmentWorkspace` | **Magic Messaging (`HrMagicMessaging`)**, **Inquiries (`HeadInquiriesManager`)**, Co-Heads | No |
| **Public Relations (`pr`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` | **Sponsors CRUD (`HeadSponsorsManager`)**, Co-Heads | No |
| **Delegate & Committee Coordination (`dcc`)** | `HeadOverview` | Delegate & Committee Apps (No team regs) | No | **Blocked by DB** | `DepartmentWorkspace` | **DCC Applications (`DCCApplicationsManager`)**, **Committees & Reg Windows (`DCCCommitteeManager`)**, Co-Heads | No |
| **Design (`design`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` (assets, print/brand tasks) | Co-Heads | No |
| **Marketing (`marketing`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` (campaigns, content calendar) | Co-Heads | No |
| **Logistics (`logistics`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` (`venue`, `equipment` shared read) | Co-Heads | No |
| **Information Technology (`it`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` (IT issues; **no** Super Admin) | Co-Heads | No |
| **Ceremonies (`ceremonies`)** | `HeadOverview` | **Blocked by DB** | No | **Blocked by DB** | `DepartmentWorkspace` (`run_of_show`, `speaker` shared read) | Co-Heads | No |

### 5.3 Feature Specifications Inside `/head`

#### Feature 1: Team Application Review & Recommendations (`HeadRegistrations.tsx`)
- **What it does:** Allows `media_press`, `security`, and `volunteers` heads to inspect full applicant dossiers (including parsed profile metadata, Q&A answers, Security word counts, Volunteer scenarios, Media portfolios & uploaded `[EXTRA_PHOTOS]` links), change application status, record internal notes, recommend/decide staffing via `wm_staffing_decisions`, and generate private member signup links for accepted applicants.
- **How the user interacts with it:** Filters by status (`received`, `under_review`, `accepted`, `waitlisted`, `rejected`, `withdrawn`), searches by name/email/institution, opens applicant drawer -> reviews answers -> updates status or submits head recommendation -> clicks **Create Signup Link** (single or batch up to 25) and copies invite message / opens Gmail compose (`ApplicantEmailLink.tsx`).
- **Components:** `src/head/HeadRegistrations.tsx`, `src/components/ApplicantEmailLink.tsx`, `src/lib/applicantProfile.ts`.
- **Backend functions:** Direct PostgREST (`team_registrations`, `wm_staffing_decisions`), `POST /functions/v1/team-signup` (`create`, `create_batch`), or `POST /api/super-admin?action=test-data|test-update` in Super IT Test Mode.
- **Database structures:** `public.team_registrations` (RLS policy `"department head read team"` / `"department head update team"` gated by `public.is_registration_head()` + department + section), `public.wm_staffing_decisions`, `public.team_signup_invites`.
- **Permissions required:** Active head in `media_press`, `security`, or `volunteers` matching `section`. Other 8 departments are blocked at DB RLS level.
- **Success & failure:** Status & recommendation persist immediately; clicking **Create Signup Link** on a non-`accepted` applicant returns HTTP `409`; attempting cross-section access returns 0 rows / `403`.

#### Feature 2: Roles & Organizational Hierarchy (`src/head/roles/*`, `rolesStore.ts`)
- **What it does:** Dual system exclusively for `media_press`, `security`, and `volunteers` heads to (a) model an arbitrary-depth organizational chart (`department_positions` with vacant or filled seats, supporting both approved `team_registrations` AND active `co_head`s) and (b) assign actionable individual tasks/roles (`department_tasks` with priority, status `not_started`/`in_progress`/`completed`, deadline, location, supervisor link, and audit log `department_task_logs`).
- **How the user interacts with it:** Inside **Roles** tab (`RolesDashboard.tsx`), switches between:
  - **Roles & Tasks Directory:** Filter by member, role, status, or supervisor; assign/edit/reassign/remove tasks; update task status directly.
  - **Hierarchy View:** Toggle between interactive **Visual Org Chart** (`OrgChartView.tsx` with parent-child connectors and expandable branches) and **List View** (`OrgListView.tsx`). Create/edit/move/delete positions (supporting vacant seats) and open **Member Role Dossier** (`MemberRoleDossier.tsx`) showing member profile + hierarchy role + all active/historical tasks + reporting supervisor's reports.
- **Components:** `src/head/roles/RolesDashboard.tsx`, `OrgChartView.tsx`, `OrgListView.tsx`, `MemberRoleDossier.tsx`, `src/head/services/rolesStore.ts`.
- **Backend / Database:** Direct PostgREST via `rolesStore.ts` to `public.department_positions`, `public.department_tasks`, `public.department_task_logs`, plus `wm-eb-access` (`list_my_coheads`) to include department co-heads alongside `team_registrations` (`status = 'accepted'`).
- **Database Triggers & Safeguards:**
  - `check_position_hierarchy_cycle()`: Prevents self-parenting, cycles, and >100 depth (`P0001: circular_hierarchy_detected`).
  - `migration_roles_and_hierarchy.sql` triggers originally validated `member_id` against `team_registrations (status='accepted')`, whereas `20261024180000_department_role_assignment_tables_and_scoped_rls.sql` updated `department_positions` & `department_tasks` to support either `team_registrations.id` or `auth.users.id` (for co-heads) with scoped head RLS.
  - Deleting a position sets `parent_position_id = NULL` on child positions and `position_id = NULL` on tasks (`ON DELETE SET NULL`), preserving task history.
- **Permissions required:** Active Head in `media_press`, `security`, or `volunteers` (scoped to `department` & `section`), or Admin (`public.is_admin()`).

#### Feature 3: Custom Team Groups (`src/head/groups/*`, `operationsStore.ts`)
- **What it does:** Allows operational heads (`volunteers`, `security`, `media_press`) to group approved team members and co-heads into named reusable squads (e.g., "Entrance Gate A", "Stage Camera Team") for 1-click bulk shift assignment.
- **Components:** `src/head/groups/GroupManagementDashboard.tsx`, `GroupFormModal.tsx`, `GroupDetailsModal.tsx`, `src/head/services/operationsStore.ts`.
- **Database:** `public.wm_team_groups`, `public.wm_team_group_members` (unique `(group_id, member_email)`), enforced by `wm_private.can_manage_operational_department(department, section)`.

#### Feature 4: Modern Shift & Roster Management (`src/head/shifts/*`, `operationsStore.ts`)
- **What it does:** Full-featured shift scheduler for `media_press`, `security`, and `volunteers`: supports `draft` / `open` / `published` / `completed` / `closed` states, descriptions, start/end timestamps, locations, capacity, bulk group/individual member/co-head assignments, supervisor designation (`is_supervisor`), station & custom responsibility notes per assignee, single-shift duplication (`ShiftDuplicateModal`), and Calendar vs List views.
- **How the user interacts with it:** Uses `ShiftManagementDashboard.tsx` -> toggles Calendar (`ShiftCalendarView`) / List (`ShiftListView`) -> opens `ShiftCreationModal` (with custom `ShiftDatePicker` / `ShiftTimePicker`) -> assigns individuals or custom Groups -> inspects `ShiftDetailsDrawer` to update attendance (`assigned`, `confirmed`, `completed`, `no_show`, `cancelled`).
- **Backend / Database:** `operationsStore.ts` (uses `/api/super-admin?action=operations` in Super IT Test Mode; direct Supabase in normal Head mode) backed by `public.wm_shifts` and `public.wm_shift_assignments` + RLS `wm_private.can_manage_operational_department` & `wm_private.can_manage_shift_assignment`.

#### Feature 5: Legacy Operations & Deployment (`OperationsWorkspace.tsx`, `TeamDeploymentPlanner.tsx`)
- **What it does:** Secondary operational views in `/head`: `OperationsWorkspace.tsx` manages `wm_people` rosters, `wm_projects` / `wm_project_stages` / `wm_project_tasks`, and department registration windows (`wm_registration_windows`), while `TeamDeploymentPlanner.tsx` schedules operational slots against `wm_shifts` / `wm_people`.
- **Note:** Only operational departments (`media_press`, `security`, `volunteers`) pass `wm_private.can_manage_operational_department` RLS.

#### Feature 6: Generic Department Workspace (`DepartmentWorkspace.tsx`, `departmentStore.ts`)
- **What it does:** Tailored task/checklist/plan/incident/run-of-show board used across all 11 departments (e.g., Design asset specs, Marketing campaigns, Logistics venue/equipment plans, IT issue tracker, Ceremonies run-of-show & speaker records, DCC committee directives).
- **Database:** `public.department_records` (`category` column distinguishes record types; `'incident'` is Security + Admin read/write only; `'venue'`, `'equipment'`, `'run_of_show'`, `'speaker'` are readable cross-department by all active heads, editable only by owning department).

#### Feature 7: Department-Specific Specialized Modules
- **HR (`hr`):**
  - `HrApplicantHub.tsx`: Read-only consolidated browser across `team_registrations`, `delegates`, and `wm_chair_applications` (`20261028150000_hr_applicant_sections.sql`).
  - `HrAcceptedApplicants.tsx`: Accepted-applicant contact & email compose helper (`ApplicantEmailLink`).
  - `HrMagicMessaging.tsx`: Previews counts (`accepted` vs `rejected` across all 3 applicant tables, deduplicated against `wm_email_messages`) and dispatches bulk emails via Resend (`POST /functions/v1/hr-bulk-email`), plus displays live delivery audit log (`wm_email_messages`).
  - `HeadInquiriesManager.tsx`: Reads and updates `status` (`new`, `read`, `resolved`, `archived`) and `admin_notes` on `public.inquiries` (`is_hr_head()`). Cannot delete inquiries.
- **PR (`pr`):**
  - `HeadSponsorsManager.tsx`: Full CRUD for `public.sponsors` + logo uploads to `site-files` bucket (`is_pr_head()`).
- **DCC (`dcc`):**
  - `DCCApplicationsManager.tsx`: Reviews and updates `public.delegates` status/notes (`is_active_dcc_head()`).
  - `DCCCommitteeManager.tsx`: Full CRUD on `public.committees` + limited updates to `public.settings` ONLY for delegate registration schedule keys (`registration_open`, `early_bird_opens`, `early_bird_closes`, `regular_opens`, `regular_closes`).
- **Co-Head Management (`HeadCoHeadManagement.tsx`):**
  - Available to active Heads; fetches reporting Co-Heads & department EB members via `POST /functions/v1/wm-eb-access` (`action: 'list_my_coheads'`), allows assigning EB tasks (`wm_eb_tasks`) and EB shifts (`wm_eb_shifts`) directly to their Co-Heads via `ebOperationsService.ts`.

---

## 6. Executive Board (`/eb`), Team Member Portals & QR Access (`/pass`, `/scanner`)

### 6.1 Executive Board Operations Portal (`/eb`)
- **Components:** `src/pages/EbPortal.tsx`, `src/components/eb/EbWelcomeAnimation.tsx`, `EbNavbar.tsx`, `EbOverviewView.tsx`, `EbTasksView.tsx`, `EbScheduleView.tsx`, `EbStationView.tsx`, `EbHierarchyView.tsx`, `EbAnnouncementsView.tsx`, `EbOversightView.tsx`, `EbEventDayMode.tsx`, and role views `src/components/eb/roles/{CoHeadCommandView,DesignStudioView,MarketingCampaignView}.tsx`.
- **Service Layer:** `src/lib/ebOperationsService.ts` (resolves user profile from Supabase session + `admins` + `department_heads` + `wm_qr_passes`, loads stations, shifts, assignments, swap requests, tasks, task comments, announcements, acks, incidents, and hierarchy).
- **Capabilities:**
  - **Role-Based Landing Overview:** `co_head` -> `CoHeadCommandView`; `designer` -> `DesignStudioView` (with West MUN palette tokens & keyword-filtered design deliverables); `marketing` -> `MarketingCampaignView`; `head`/`admin` -> `EbOverviewView`.
  - **Tasks (`EbTasksView`):** Board (`not_started`, `in_progress`, `blocked`, `completed`) & List views, JSONB checklist item toggling, completion-note & blocker-reason prompts, threaded `wm_eb_task_comments`. Assignees can update own tasks; Heads, Admins, and Co-Heads (`is_eb_department_manager`) can create/manage department tasks.
  - **Schedules & Swaps (`EbScheduleView`):** Shows `wm_eb_shifts` + `wm_eb_shift_assignments`, performs client-side overlap conflict detection (`aStart < bEnd && bStart < aEnd`), allows members to submit swap requests (`wm_eb_shift_swaps`), and allows Heads/Admins/Co-Heads to approve/reject swaps and create/publish department shifts (`is_published`, `break_schedule`, `checklist`).
  - **Stations (`EbStationView`):** Venue SOP manuals, required equipment, emergency `tel:` contacts, and persistent opening/closing checklists (`wm_eb_stations`).
  - **Hierarchy (`EbHierarchyView`):**
    - **Admins & Heads:** View full 4-tier hierarchy: **Level 1** equal peer triad (`SG | DSG | USG` side-by-side) -> **Level 2** (`Senior Advisor`) -> **Level 3** (active Department Heads resolved via `wm-eb-access` + `secretariat`) -> **Level 4** (active Co-Heads linked via `reporting_head_id` or team/section match). Toggle Mind-Map Chart vs List view + Member Dossier modal.
    - **Scoped Non-Head EB Members (`!isAdmin && !isHead`):** Restricted view (`isScopedMember = true`) hiding full org tree/search/Secretariat triad and displaying **only** their assigned Reporting Head.
  - **Announcements (`EbAnnouncementsView`):** Department or `'all'` broadcasts with `'critical'` top banner and explicit acknowledgement tracking (`wm_eb_announcement_acks`).
  - **Oversight (`EbOversightView`):** Heads/Admins analytics (task completion %, blocked deliverables, overdue tasks, unassigned station staffing gaps).
  - **Event-Day Mode (`EbEventDayMode`):** Mobile-first simplified dashboard with 1-tap `tel:` call to supervisor, active shift card, top-4 task checklists, live `wm_eb_incidents` feed + Report & Resolve Incident workflows.

### 6.2 Team Member Portal (`/team-members`, `/volunteer`, `/media`, `/security`)
- **Components:** `src/team/TeamMemberPortal.tsx`, `src/team/TeamWelcomeIntro.tsx`.
- **What it does:** Member portal for accepted team applicants signed in via `/signup`. Resolves member identity from `team_registrations` + `wm_team_group_members` (`20261026210000_team_member_role_visibility.sql`) + `department_positions` / `department_tasks` + shifts (`wm_shifts` / `wm_shift_assignments` AND `wm_eb_shifts` / `wm_eb_shift_assignments`), and embeds link to `/pass` (and `/scanner` for Security members).
- **Database:** Scoped SELECT policies matching `lower(auth.jwt() ->> 'email')` or `auth.uid()` so members only see their own roles, tasks, groups, and assigned shifts (`20261026230000_fix_team_shift_visibility.sql`, `20261026231000_team_member_read_own_eb_shifts.sql`).

### 6.3 Digital QR Pass (`/pass`) & Security Scanner (`/scanner`)
- **Digital Pass (`src/pages/PassPage.tsx`):**
  - Calls `POST /functions/v1/wm-qr-access` (`action: 'pass'`).
  - For regular Team Members / Heads / Admins, auto-resolves canonical `fullName` from `user_metadata` -> accepted `team_registrations` -> active `wm_people` -> `department_heads` -> existing `wm_qr_passes`, updates/inserts `wm_qr_passes` with cryptographic 64-hex `qr_token`, and renders QR badge + inside/outside venue status.
  - For `eb_member`, reads existing active `wm_qr_passes` row issued during EB signup.
- **Security Scanner (`src/pages/ScannerPage.tsx`):**
  - Calls `wm-qr-access` (`action: 'access'`) on load to verify `canScan === true`.
  - Uses device camera (HTML5 QR scanner) or manual token entry to call `wm-qr-access` (`action: 'scan'`, `{ qrToken, direction: 'entry' | 'exit' }`) and `action: 'checked_in'` (via `CheckedInPeople.tsx`) for live inside-venue count/roster.
  - **Strict Permission Rule:** `canScan` is `true` **ONLY** for:
    1. Active **Admins** (`public.admins`)
    2. Active **Security Department Heads** (`department_heads.department IN ('security', 'security & protocol')`)
    3. Active **Security Co-Heads** (`team` in Security AND role in `co_head` / `security` / `security_officer`)
    4. Accepted **Security Team Members** (`wm_role = 'team_member'` AND `wm_team` in Security)
  - Non-security Co-Heads, non-security Heads, Designers, Marketing, Media, and Volunteers receive HTTP `403` from `wm-qr-access` and are blocked by `public.is_security_scanner_authorized()` RLS on `wm_qr_passes` / `wm_qr_scan_logs`.
  - **Audit & Duplicate Prevention:** `scan` rejects entry if already `inside = true` (`409 already_checked_in`) and exit if `inside = false` (`409 not_checked_in`), logging every `'allowed'` and `'denied'` attempt to `public.wm_qr_scan_logs`.

---

## 7. Invitation & Account Onboarding System

WEST MUN implements **three distinct onboarding mechanisms**:

### 7.1 Team Member Signup Invites (`/signup`, `team-signup` Edge Function)
- **What it does:** Converts `accepted` applicants (`security`, `media`, `volunteers`) into authenticated `team_member` accounts.
- **Token Generation:** Head (of matching dept/section) or Admin calls `team-signup` `action: 'create'` (1 ID) or `'create_batch'` (1–25 IDs). Generates 32-byte crypto random hex token (`64` hex chars), stores **only SHA-256 `token_hash`** in `public.team_signup_invites`, revokes any prior unrevoked invite for that `registration_id`, sets `expires_at = 9999-12-31T23:59:59.999Z`, and returns `/signup#token=<raw_token>` (hash fragment keeps token out of HTTP referer/server logs).
- **Verification & Claim:** User visits `/signup` (`SignupPage.tsx`), enters application email + password (12–128 chars). `team-signup` `action: 'signup'` verifies:
  1. Valid 64-hex token hash & not `revoked_at`.
  2. `email === invite.email` (exact lowercased match).
  3. Re-checks `team_registrations` live row: `status === 'accepted'` and matching `email`, `team`, `section`. (If applicant was later un-accepted/rejected, invite stops working immediately!)
  4. Acquires optimistic concurrency lock via `claimed_at` + `claim_id` (10-minute stale lock expiry).
- **Account Creation / Existing Login Reuse:**
  - Creates new Auth user (`email_confirm: true`, `app_metadata: { wm_role: 'team_member', wm_team, wm_section, wm_registration_id }`, canonical `full_name` from `team_registrations`, ignoring arbitrary typed name).
  - If email already registered in Auth, verifies existing password via `anon` `signInWithPassword` and rejects (`409`) if the existing user has an active Admin, active Head, active QR pass, or another accepted registration. If stale/orphan metadata, safely updates `app_metadata` and `user_metadata.full_name`.
  - On finalization failure, automatically rolls back created/updated Auth user.
  - *Important Detail:* Clears `claimed_at`/`claim_id` after finalization without setting `redeemed_at`; link remains valid until revoked or registration status leaves `'accepted'`.

### 7.2 Executive Board Invites & Reusable EB Link (`/eb-signup`, `wm-eb-access` Edge Function)
1. **Personal 7-Day Email-Locked Invite (`create_invite` + `signup`):**
   - Admin on `/admin/eb-invites` enters email, department, section, and `ebRole` (from 14 allowed role slugs).
   - Stores SHA-256 `token_hash` in `public.wm_eb_invites` with 7-day expiry (`expires_at`), revoking any prior unredeemed invite for that email.
   - On `/eb-signup` (`EbSignupPage.tsx`), validates token, exact email match, full name (2+ words, 5–120 chars), 12–128 char password, concurrency lock (`claimed_at`/`claim_id`), creates/links Auth user (`wm_role: 'eb_member'`), inserts `wm_qr_passes`, and stamps `redeemed_at` (true single-use). Rolls back to `wm_role: 'pending_eb_setup'` on partial failure.
2. **Reusable EB Signup Link (`create_signup_link` + `signup_public`):**
   - Admin generates a single active reusable URL (`/eb-signup#token=<raw_token>`, SHA-256 hash stored in `public.wm_eb_signup_links`), automatically setting `active = false` on any previous link.
   - Applicant chooses EB Role (`co_head`, `designer`, or `marketing`), Gender (`male`/`female`), Unique Phone (7–15 digits, checked against `wm_qr_passes.phone` digits unique index), and — **if `co_head`** — selects their Reporting Head from the live dropdown (`list_active_heads`), which server-side validates against `department_heads.active = true` and inherits that head's `department` & `section`.
   - Sets `app_metadata` (`wm_role: 'eb_member'`, `wm_eb_role`, `wm_reporting_head_id`) and inserts `wm_qr_passes` (rolling back `auth.admin.deleteUser` if QR pass insert fails, e.g., duplicate phone `23505`).
   - *Developer Test Recycling:* Two explicit developer test emails (`<REUSABLE_TEST_EMAIL_1>`, `<REUSABLE_TEST_EMAIL_2>`) are auto-recycled if orphaned in `auth.users` with zero rows in `admins`, `department_heads`, or `wm_qr_passes`.

### 7.3 Department Head Provisioning (`/api/super-admin`)
- Super Admin creates a Head via `handleCreateHeadAccount`:
  - Checks/reuses or creates Auth user (`app_metadata.role = 'department_head'`, `department`, `section`), writes synchronized `id = user_id` row to `public.department_heads`, enforces single active head per gender-separated `(department, section)`, and can issue password reset / invite links via Supabase Auth Admin API (`handleResetPassword`).

---

## 8. Email & Messaging Infrastructure

WEST MUN uses **two server-side email providers** plus **client-side compose workflows**:

### 8.1 Resend Bulk HR Messaging (`supabase/functions/hr-bulk-email/index.ts`)
- **Purpose:** Sends standardized bulk acceptance and rejection notifications across all three applicant tables (`team_registrations`, `wm_chair_applications`, `delegates`).
- **Required Env Secrets:** `RESEND_API_KEY`, `WESTMUN_EMAIL_FROM`, `WESTMUN_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Auth:** Bearer JWT verified against `public.admins` OR `public.department_heads (department = 'hr', active = true)`.
- **Actions:**
  - `preview`: Counts totals, `alreadyHandled` (deduplicated via `wm_email_messages` where `template_key IN ('acceptance','rejection')` and `status IN ('queued','sent')`), `missingEmail`, and `ready` per status, returning default subject/body templates with placeholders (`{name}`, `{department}`, `{institution}`).
  - `send`: Validates custom/default templates (subject 1–200 chars, body 1–12,000 chars), inserts `'queued'` row into `wm_email_messages` (skipping on `23505` unique conflict), POSTs gold-on-black branded HTML + plain text to `https://api.resend.com/emails`, and updates `wm_email_messages` to `'sent'` (with `provider_message_id`, `sent_at`) or `'failed'` (with sanitized `error_message`).

### 8.2 Shared Single-Tenant Gmail OAuth2 (`gmail-oauth-*` & `gmail-send-acceptance`)
- **Purpose:** Connects one official conference Gmail account in Admin **Settings** (`SettingsManager.tsx`) to send **individual Delegate Acceptance Emails** from `/admin`.
- **Flow (`gmail-oauth-start`, `gmail-oauth-callback`, `gmail-oauth-status`, `gmail-oauth-disconnect`):**
  1. `gmail-oauth-start`: Admin-only; creates CSPRNG nonce, stores SHA-256 `nonce_hash` in `public.gmail_oauth_states` with `user_id` & short expiry, returns Google OAuth URL (`access_type=offline`, `prompt=consent`, `gmail.send` scope).
  2. `gmail-oauth-callback`: Verifies `nonce_hash` unconsumed & unexpired, marks `consumed_at`, exchanges code for `refresh_token`, encrypts refresh token using **AES-256-GCM** (`v1:<iv_b64url>:<cipher_b64url>` keyed by `SHA-256(GMAIL_TOKEN_ENCRYPTION_KEY)`), upserts singleton row (`singleton = true`) in `public.gmail_oauth_credentials`.
  3. `gmail-send-acceptance`: Admin-only (`public.admins`); verifies delegate exists and `status === 'accepted'`; decrypts refresh token -> refreshes Google access token -> constructs Base64URL MIME `multipart/alternative` (plain + HTML) email -> sends via `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.
- **Security:** Both `gmail_oauth_states` and `gmail_oauth_credentials` have RLS enabled with **zero client policies** and `REVOKE ALL FROM public, anon, authenticated`. Only `service_role` inside Edge Functions can access them.

### 8.3 Client-Side Messaging (`ApplicantEmailLink.tsx`, `src/lib/applicantEmail.ts`)
- **Purpose:** Used in Head Portal (`HeadRegistrations`, `HrAcceptedApplicants`) and Admin panels to email individual applicants or paste generated signup messages without server mail quota limits.
- **Behavior:** Builds pre-populated Gmail Web Compose URL (`https://mail.google.com/mail/?view=cm&to=...&su=...&body=...`), `mailto:` URI, and one-click clipboard copy.

---

## 9. Backend APIs & Edge Functions Inventory

### 9.1 Supabase Edge Functions (`/supabase/functions/*/index.ts`)
All enforce strict `Origin === WESTMUN_SITE_URL` CORS (`wm-eb-access` & `wm-qr-access` also permit a specific Vercel preview regex) and `Cache-Control: no-store`.

| Edge Function | Key Actions & HTTP Behavior | Caller Authority Required | Primary DB Tables Touched |
|---|---|---|---|
| `team-signup` | `create`, `create_batch`, `signup` (`POST`) | `create`/`create_batch`: Admin or matching active Dept Head; `signup`: Public with valid token + email | `team_signup_invites`, `team_registrations`, `auth.users` |
| `wm-eb-access` | `create_signup_link`, `create_invite`, `delete_member`, `list_members`, `list_active_heads`, `list_my_coheads`, `signup_public`, `signup` (`POST`) | `list_active_heads`/`signup`/`signup_public`: Public (token-gated for signups); `list_my_coheads`: Active Head or Admin; `create_*`/`list_members`: Admin; `delete_member`: `<PRIMARY_SUPER_ADMIN_EMAIL>` | `wm_eb_invites`, `wm_eb_signup_links`, `wm_qr_passes`, `department_heads`, `admins`, `auth.users` |
| `wm-qr-access` | `access`, `pass`, `checked_in`, `scan` (`POST`) | `access`/`pass`: Any Admin, Head, `team_member`, or `eb_member`; `checked_in`/`scan`: Admin, Security Head, Security Co-Head, or Security Team Member | `wm_qr_passes`, `wm_qr_scan_logs`, `admins`, `department_heads`, `team_registrations`, `wm_people`, `auth.users` |
| `hr-bulk-email` | `preview`, `send` (`POST`) | Admin OR active HR Head (`department='hr'`) | `team_registrations`, `wm_chair_applications`, `delegates`, `wm_email_messages` |
| `gmail-oauth-start` | Start OAuth consent redirect (`GET`/`POST`) | Admin (`public.admins`) | `gmail_oauth_states` |
| `gmail-oauth-callback` | Handle Google code callback (`GET`) | Valid unconsumed `gmail_oauth_states` nonce | `gmail_oauth_states`, `gmail_oauth_credentials` |
| `gmail-oauth-status` | Return `{ connected, connectedAt }` | Admin (`public.admins`) | `gmail_oauth_credentials` |
| `gmail-oauth-disconnect` | Delete singleton OAuth token | Admin (`public.admins`) | `gmail_oauth_credentials` |
| `gmail-send-acceptance` | Send delegate acceptance email | Admin (`public.admins`) | `delegates`, `gmail_oauth_credentials` |

### 9.2 Node / Vercel Serverless Endpoints (`/api/*`)
Mounted in `server.ts` (Express dev) and Vercel `api/*.js` -> `serverless/*.ts`:

| Route | Handler Module | Purpose |
|---|---|---|
| `/api/super-admin` | `serverless/super-admin.ts` -> `src/server/{superAdminHandler,departmentRecordsAdmin,operationsAdmin}.ts` | Admin session verification (`action=session\|verify`); Super Admin management of normal admins (`scope=admins`), department heads (CRUD, assign, password reset), application hard-delete (`delete-application`), Super IT Test Mode (`launch-test`, `consume-ticket`, `verify-test-session`, `terminate-test-session`, `test-data`, `test-update`, `test-records`, `test-record-save`, `test-record-delete`, `operations\|ops\|wm_ops_*`). |
| `/api/head-auth` | `serverless/head-auth.ts` -> `src/server/headStore.ts` | Local-dev file-backed Head login/session/reset fallback. Returns `503 USE_SUPABASE_AUTH` on Vercel production. |
| `/api/qr-access` | `serverless/qr-access.ts` | Legacy/alternative Node QR check-in endpoint (`action=scan\|history`) using `delegates` / `team_registrations` / `wm_qr_checkins`. Restricted to Admins & active Security `department_heads`. *(Note: Active frontend `/scanner` uses Edge Function `wm-qr-access`, not `/api/qr-access`.)* |
| `/api/health`, `/api/contact`, `/api/register`, `/api/team-register`, `/api/admin/*` | `api/local-routes.ts` | Local dev JSON-file fallback endpoints (`data/registrations.json`, `data/inquiries.json`, env `ADMIN_PASSWORD` auth). |

---

## 10. Database Architecture, Triggers, Functions & RLS

### 10.1 Schema Inventory (Checked-in SQL vs Live Runtime Extensions)

#### A. Core Identity & Access Tables
- **`public.admins`**: `user_id` (PK -> `auth.users`), `email`, `full_name`, `role` (`'super_admin' | 'admin'`), `active` (`boolean`), `created_at`. Policy: authenticated users read own row (`user_id = auth.uid()`); writes via Super Admin service-role backend.
- **`public.department_heads`**: `id` / `user_id` (both kept identical via `sync_department_heads_keys` trigger, PK -> `auth.users`), `email`, `head_name`, `department` (11 allowed slugs), `section` (`'male' | 'female' | NULL`, constrained by `department_heads_section_check` + unique partial index on `(department, section)` for `media_press`, `security`, `volunteers`), `active`, `created_at`, `updated_at`. RLS: Heads read own + co-heads in same dept/section; Admins manage all.
- **`public.wm_qr_passes`**: `user_id` (PK -> `auth.users`), `qr_token` (unique 64-hex), `full_name`, `email`, `account_role`, `team`, `section`, `phone` (digits-only unique partial index `wm_qr_passes_phone_digits_unique`), `gender`, `reporting_head_id` (`uuid`), `active`, `inside`, `last_scanned_at`, `created_at`, `updated_at`. Column-level grant restricts client `UPDATE` on `(inside, last_scanned_at, updated_at)` to `is_security_scanner_authorized()`.
- **`public.wm_qr_scan_logs`**: `id`, `scanner_user_id`, `pass_user_id`, `pass_full_name`, `team`, `section`, `direction` (`'entry'|'exit'`), `outcome` (`'allowed'|'denied'`), `reason`, `scanned_at`. Read/insert restricted to `is_security_scanner_authorized()`.
- **`public.wm_eb_invites`**: `id`, `email`, `department`, `section`, `eb_role`, `token_hash` (unique), `expires_at`, `created_by`, `claimed_at`, `claim_id`, `redeemed_at`, `revoked_at`. `REVOKE ALL` from `anon, authenticated`; `service_role` only.
- **`public.wm_eb_signup_links`**: `id`, `token_hash` (unique), `active`, `created_by`, `created_at`, `expires_at`. `service_role` only.

#### B. Public CMS & Registration Tables
- **`public.settings`**: `key` (PK), `value`, `updated_at`. Public `SELECT`; Admin `ALL`; DCC Head `UPDATE` restricted to 5 delegate window keys.
- **Public Content Tables** (`secretariat`, `committees`, `schedule_days`, `schedule_sessions`, `faq`, `documents`, `sponsors`, `announcements`): Public reads `published = true`; Admins CRUD; **PR Head** CRUD on `sponsors`; **DCC Head** CRUD on `committees`.
- **`public.delegates`**: Application tier (`early_bird`, `regular`), `delegation_type`, `status`, `payment_status`, `fee_amount`, `admin_notes`, `age_confirmed`, `consent_version`, `consent_at`, unique `(lower(email), tier)`. Guard trigger `delegates_guard_trg`. Read/Update by Admin, DCC Head, and (Read-Only) HR Head.
- **`public.team_registrations`**: `full_name`, `email`, `phone`, `institution`, `team` (`security`, `media`, `volunteers`), `section` (`male`, `female`), `experience`, `statement`, `status`, `admin_notes`, `admin_finalized_at`, `admin_finalized_by`, 4 `security_*` columns, 4 `volunteer_*` columns, unique `(lower(email), team)`. Guard trigger `team_registrations_guard_trg`. Read/Update by Admin or matching `is_registration_head()` (`media_press`, `security`, `volunteers`); Read-Only by active HR Head (`20261028150000`).
- **`public.inquiries`**: Public contact messages; guard trigger `inquiries_guard_trg`; Read/Update by Admin & `is_hr_head()`; Delete by Admin only.

#### C. Head Workspaces, Roles, Groups & Operations Studio
- **`public.department_records`**: Generic JSONB department workspace (`department`, `section`, `category`, `title`, `status`, `priority`, `data`, `created_by`).
- **`public.department_positions` & `public.department_tasks` & `public.department_task_logs`**: Roles & Org Hierarchy tables for `media_press`, `security`, `volunteers` (and Admin). Cycle prevention trigger (`check_position_hierarchy_cycle`), scoped head RLS (`20261024180000`), and member read-own policies.
- **`public.wm_people`, `wm_projects`, `wm_project_stages`, `wm_project_members`, `wm_project_tasks`, `wm_shifts`, `wm_shift_assignments`, `wm_registration_windows`**: Operations Studio & Modern Shift Management (`wm_shifts` extended with `description` & `draft/open/published/completed/closed` statuses; `wm_shift_assignments` extended with nullable `person_id`, `member_id`, `role_type`, `responsibility`, `station`, `notes`, `is_supervisor`, `assignee_name`, `assignee_email`). Restricted by `wm_private.can_manage_operational_department()` to Super Admin + heads of `volunteers`, `security`, `media_press`. Compatibility views alias `wm_eb_shifts` -> `wm_shifts` / `wm_eb_shift_assignments` -> `wm_shift_assignments` / `wm_eb_tasks` -> `wm_project_tasks` if run in order (see Section 13.1!).
- **`public.wm_team_groups` & `public.wm_team_group_members`**: Custom squads (`(group_id, member_email)` unique). Non-recursive split INSERT/UPDATE/DELETE policies (`20261026220000`) + team member own-membership read policy (`20261026210000`).

#### D. Executive Board (EB) Operations Tables
- **`wm_eb_stations`**, **`wm_eb_shifts`** (`is_published`, `break_schedule`, `checklist`), **`wm_eb_shift_assignments`**, **`wm_eb_shift_swaps`**, **`wm_eb_tasks`** (`checklist` jsonb, `completion_note`, `blocker_reason`), **`wm_eb_task_comments`**, **`wm_eb_templates`**, **`wm_eb_announcements`**, **`wm_eb_announcement_acks`**, **`wm_eb_incidents`**, **`wm_eb_hierarchy_nodes`**.
- Scoped by `public.is_eb_department_manager(target_dept)` (Admins + active Dept Heads + active `co_head`s in `wm_qr_passes` matching department with `media`/`media_press` normalization).

#### E. Private OAuth Storage
- **`public.gmail_oauth_states` & `public.gmail_oauth_credentials`**: RLS enabled, zero client policies, `service_role` only.

#### F. Live-Database Tables Referenced in Code Without Checked-In `CREATE TABLE` DDL
Rebuilding this platform requires creating these 5 tables explicitly (their definitions exist in live Supabase but lack initial DDL in `supabase/*.sql`):
1. **`public.wm_staffing_decisions`**: `registration_id` (FK -> `team_registrations.id`), `department`, `section`, `role_title`, `head_decision`, `head_notes`, `head_user_id`, `head_submitted_at`, `admin_decision`, `admin_notes`, `admin_reviewed_at`. (Repo includes `20261026000000_allow_admin_read_staffing_decisions.sql` policy patch only.)
2. **`public.wm_email_messages`**: `id`, `applicant_id`, `applicant_type` (`'team'|'chair'|'delegate'`), `source_applicant_id`, `recipient_email`, `recipient_name`, `subject`, `body_text`, `template_key` (`'acceptance'|'rejection'`), `status` (`'queued'|'sent'|'failed'`), `provider` (`'resend'`), `provider_message_id`, `error_message`, `sent_by`, `created_at`, `sent_at` + unique partial index preventing duplicate `'queued'`/`'sent'` emails per `(applicant_type, source_applicant_id, template_key)`.
3. **`public.team_signup_invites`**: `id`, `registration_id`, `email`, `team`, `section`, `token_hash` (unique), `expires_at`, `created_by`, `claimed_at`, `claim_id`, `redeemed_at`, `revoked_at`.
4. **`public.wm_chair_applications`**: `id`, `full_name`, `email`, `phone`, `institution`, `committee_preferences`, `experience`, `statement`, `status`, `admin_notes`, `age_confirmed`, `consent_version`, `consent_at`, `created_at`, `updated_at`.
5. **`public.wm_qr_checkins`**: Legacy check-in log used only by `/serverless/qr-access.ts` (`ticket_id`, `attendee_type`, `attendee_id`, `attendee_name`, `attendee_email`, `committee_or_team`, `institution`, `station`, `scanned_by_email`, `scanned_by_name`, `status`, `notes`, `scanned_at`).

### 10.2 Key SQL Helper Functions (`SECURITY DEFINER`)
- `public.is_admin()` -> Active row in `public.admins`.
- `public.is_super_admin()` / `wm_private.is_super_admin()` -> Super Admin check.
- `public.head_department()` / `public.head_section()` -> Active `department_heads` lookup by `auth.uid()`.
- `public.is_registration_head()` -> Active head of `'media_press'`, `'security'`, or `'volunteers'`.
- `public.is_pr_head()` / `public.is_hr_head()` / `public.is_active_dcc_head()` -> Specialized non-registration head scopes.
- `public.is_eb_department_manager(target_dept)` -> Admin, matching active Head, or matching active `co_head` in `wm_qr_passes`.
- `public.is_security_scanner_authorized()` -> Admin, active Security Head, or active Security `co_head`/`security`/`security_officer` in `wm_qr_passes`. *(Note: `wm-qr-access` Edge Function also allows accepted Security `team_member`s via service-role).*
- `wm_private.can_manage_operational_department(dept, section)` -> Super Admin OR active head of `volunteers`, `security`, `media_press` matching section.

---

## 11. Security Controls, Audit Logging & UX Patterns

- **Defense-in-Depth:** Every privileged path validates JWTs server-side via `service_role` or `SECURITY DEFINER` SQL functions. Client `app_metadata` is treated as routing metadata, never sole proof for Admin/Head privileges.
- **Trigger Tamper-Proofing:** Public `INSERT` forms cannot inject `status='accepted'`, `payment_status='paid'`, `fee_amount=0`, or bypass closed registration windows — DB triggers overwrite these server-side before commit.
- **Anti-Hijack Existing Account Rules:** Both `team-signup` and `wm-eb-access` verify current password before attaching roles to an existing Auth email and refuse to overwrite accounts holding active Admin, Head, or active QR assignments.
- **Secret Hygiene:** Refresh tokens encrypted at rest with AES-256-GCM; invite/signup tokens stored exclusively as SHA-256 hashes and transported in URL `#token=` hash fragments.
- **Audit Trails:**
  - `public.wm_qr_scan_logs` (every allowed & denied QR entry/exit scan).
  - `public.wm_email_messages` (every queued/sent/failed bulk HR email).
  - `public.department_task_logs` (task creation, status changes, reassignments).
  - `superAdminHandler.ts` in-memory `auditLog` (Super IT Test Mode launch/exit/mutation audit).
- **UX Design System:** Black-and-gold diplomatic aesthetic (`#070707` ground, warm gold accents, `Cinzel` display headers, `Cormorant Garamond` accents, `Plus Jakarta Sans` UI body), responsive mobile navigation drawers (`DashboardShell`, `EbNavbar`), `EventDayMode` high-contrast field controls, explicit confirmation/rollback feedback toasts, and zero mock data in production portals.

---

## 12. Complete End-to-End Workflow Map

```text
[1. PUBLIC APPLICATION & REVIEW]
Applicant submits Team Modal (/, TeamRegistrationModal)
  |-- Honeypot check + Client validation (Security 80/50/50/50 words; Media photos -> `registration-extra`)
  v
Supabase `team_registrations` INSERT -> `team_registrations_guard_trg` validates open switch & word counts -> `status='received'`
  v
Department Head (/head, Media/Security/Volunteers ONLY, section-isolated) OR Admin (/admin)
  |-- Reviews Q&A + sets `status='accepted'` + saves `wm_staffing_decisions`
  v
Head/Admin clicks "Create Signup Link" -> POST /functions/v1/team-signup (action: create | create_batch)
  |-- Stores SHA-256 token hash in `team_signup_invites` -> returns `/signup#token=...`

[2. TEAM MEMBER ONBOARDING & PORTAL ACCESS]
Applicant opens `/signup#token=...` -> enters email + password -> POST `team-signup` (action: signup)
  |-- Verifies token hash, email match, live `team_registrations.status == 'accepted'`
  |-- Acquires optimistic `claim_id` -> creates/links `auth.users` (`wm_role='team_member'`)
  v
Member signs in at `/login` -> routed to `/volunteer` | `/media` | `/security` (TeamMemberPortal)
  |-- Reads assigned `wm_team_groups`, `wm_shifts`, `wm_eb_shifts`, `department_positions`, `department_tasks`
  |-- Requests QR Pass at `/pass` -> POST `wm-qr-access` (action: pass) -> generates `wm_qr_passes` 64-hex token

[3. EXECUTIVE BOARD (EB) ONBOARDING & OPERATIONS]
Admin (/admin/eb-invites) issues either:
  (A) 7-day Email-Locked Invite (`wm_eb_invites`) OR (B) Reusable EB Link (`wm_eb_signup_links`)
  v
EB Candidate opens `/eb-signup#token=...` -> POST `wm-eb-access` (action: signup | signup_public)
  |-- If `co_head` via public link: chooses active Dept Head (`list_active_heads`), unique phone, gender
  |-- Creates `auth.users` (`wm_role='eb_member'`) + active `wm_qr_passes` (with `reporting_head_id`)
  v
EB Member enters `/eb` (EbPortal):
  |-- Co-Head -> CoHeadCommandView | Designer -> DesignStudioView | Marketing -> MarketingCampaignView | Head/Admin -> EbOverviewView
  |-- Updates `wm_eb_tasks` & checklists, requests shift swaps (`wm_eb_shift_swaps`), acknowledges `wm_eb_announcements`, logs `wm_eb_incidents`

[4. VENUE CHECK-IN & QR SCANNING]
Authorized Operator opens `/scanner` (Admin | Security Head | Security Co-Head | Security Team Member)
  |-- Loads `wm-qr-access` (action: access & checked_in) -> verifies `canScan == true`
  |-- Scans badge QR -> POST `wm-qr-access` (action: scan, direction: entry | exit)
  |-- Server validates `qr_token` active & checks `inside` state conflict -> flips `inside` -> inserts `wm_qr_scan_logs`

[5. BULK & ACCEPTANCE EMAILING]
Delegate Accepted by Admin/DCC -> Admin clicks Send Acceptance (/admin) -> POST `gmail-send-acceptance` -> Decrypts AES-GCM token -> Sends via Gmail REST API
All Accepted/Rejected Applicants -> HR Head (/head) or Admin clicks Send -> POST `hr-bulk-email` -> Deduplicates via `wm_email_messages` -> Sends via Resend API

[6. SUPER IT TEST MODE]
Primary Super Admin (/admin) selects Dept + Section -> POST `/api/super-admin?action=launch-test`
  |-- Opens `/head?test_ticket=...` -> exchanged for 2h HMAC-SHA256 `sessionToken`
  |-- Head Portal proxies reads/writes through `/api/super-admin?action=test-*` under server-clamped scope
```

---

## 13. Important Implementation Details, Edge Cases & Observed Discrepancies

When reproducing this platform, pay close attention to the following architectural nuances and existing bugs discovered in the reference codebase:

1. **Co-existence of Three Parallel Shift/Task Subsystems (Migration Collision Risk):**
   - The repo evolved across three iterations that share overlapping concepts and names:
     - **Roles & Tasks (`/head` Roles tab):** `department_positions`, `department_tasks`, `department_task_logs`.
     - **Operations Studio & Modern Shifts (`/head` Groups/Shifts tabs):** `wm_shifts` (UUID PK), `wm_shift_assignments`, `wm_people`, `wm_projects`, `wm_project_tasks`, `wm_team_groups`.
     - **EB Operations Portal (`/eb`):** `wm_eb_shifts` (created as `text` or `uuid` PK across `migration_eb_operations.sql` vs `migration_eb_schedules_tasks_security.sql`), `wm_eb_shift_assignments`, `wm_eb_tasks`.
   - **Critical Migration Warning:** `migration_shift_management_redesign.sql` (lines 64–71) runs `CREATE OR REPLACE VIEW public.wm_eb_shifts AS SELECT * FROM public.wm_shifts;` (and views for `wm_eb_shift_assignments`, `wm_eb_tasks`), which **conflicts** with the real base tables of the same names defined in `migration_eb_operations.sql` and `migration_eb_schedules_tasks_security.sql`! In a clean rebuild, keep EB tables and Modern Shift tables strictly separate and do not run those compatibility views over real EB tables.

2. **Two Separate QR Check-In Backends:**
   - The active frontend (`/pass` and `/scanner`) communicates exclusively with the Supabase Edge Function `wm-qr-access` (`wm_qr_passes` + `wm_qr_scan_logs`).
   - Legacy `/serverless/qr-access.ts` (`/api/qr-access` writing `wm_qr_checkins`) remains mounted on Express/Vercel, has stricter scanner rules (omits team members), and uses different table schemas. Reproduce only the `wm-qr-access` flow unless legacy check-in reports are needed.

3. **Security UI Leak vs. Server Enforcement on Scanner Access:**
   - In `src/components/eb/roles/CoHeadCommandView.tsx` (line 54), `const canScan = profile.isAdmin || isSecurity || profile.role === 'co_head';` renders the **"Launch QR Scanner"** card for **every** Co-Head regardless of department, and `EbNavbar.tsx` (line 89) displays a `"Scanner"` top-nav link to all EB members.
   - True security is preserved because `/scanner` (`ScannerPage.tsx` -> `wm-qr-access`) and Postgres RLS (`is_security_scanner_authorized()`) reject non-Security Co-Heads with `403`. A clean reproduction should align the UI check (`isSecurity && ...`) with the backend rule.

4. **`RolesDashboard` & Non-Proxy Features Under Super IT Test Mode:**
   - Core Head tabs (`HeadOverview`, `HeadRegistrations`, `DepartmentWorkspace`, `ShiftManagementDashboard`, `GroupManagementDashboard`) route queries/writes through `/api/super-admin?action=test-*` when `isTestMode` is active.
   - However, `rolesStore.ts`, `HrMagicMessaging.tsx`, `HeadSponsorsManager.tsx`, `DCCCommitteeManager.tsx`, and `HeadInquiriesManager.tsx` query Supabase directly with the browser JWT, meaning Super IT Test Mode (which impersonates a department without modifying the Super Admin's `department_heads` row) will either read with Admin RLS or fail `head_department()` checks in those direct-query tabs.

5. **`wm_eb_tasks` Assignee Matching in `EbTasksView.tsx`:**
   - When a manager creates a task directly from `EbTasksView.tsx` in `/eb`, `assigned_to_user_id` is passed as `null` and matched loosely by `assigned_to_name`, whereas creating tasks from `HeadCoHeadManagement.tsx` sets `assigned_to_user_id` explicitly.

6. **Incomplete Toggle in `EbScheduleView.tsx`:**
   - `EbScheduleView.tsx` stores a `viewFormat` (`'timeline' | 'calendar'`) toggle state in the UI, but both branches render the same vertical list layout.

7. **Unrevoked `team-signup` Invites & Dual Expiry Semantics:**
   - `wm-eb-invites` stamps `redeemed_at` on first use (strictly one-time) and expires in 7 days.
   - `team-signup` deliberately sets `expires_at = 9999-12-31` and clears `claimed_at`/`claim_id` **without** stamping `redeemed_at`, so a link stays valid as long as `team_registrations.status === 'accepted'` and the invite has not been explicitly `revoked_at` (with conflict checks guarding existing accounts).

8. **Legacy SQL `SECURITY DEFINER` RPC Hygiene (`migration_head_system_fix.sql`):**
   - `migration_head_system_fix.sql` defines `assign_department_head_by_uid(...)` as `SECURITY DEFINER` without an internal `is_admin()` guard or `REVOKE EXECUTE FROM PUBLIC`. While later workflows rely on `service_role` APIs and `wm_private` functions, a faithful new implementation **must** check `public.is_admin()` inside every `SECURITY DEFINER` mutation RPC and revoke `PUBLIC` execution.

9. **Missing Initial DDL for 5 Production Tables:**
   - As detailed in Section 10.1.F, `wm_staffing_decisions`, `wm_email_messages`, `team_signup_invites`, `wm_chair_applications`, and `wm_qr_checkins` lack `CREATE TABLE` migrations in `/supabase/`. Any clean deployment from scratch must reconstruct and apply their schemas first.

10. **Primary Super Admin Email Hardcoding & PII Separation:**
    - Server-side handlers (`src/server/superAdminHandler.ts`, `supabase/functions/wm-eb-access/index.ts`) hardcode `<PRIMARY_SUPER_ADMIN_EMAIL>` as an unremovable Super Admin alongside `admins.role = 'super_admin'`. In a new conference platform, externalize this into an environment variable (e.g., `PRIMARY_SUPER_ADMIN_EMAIL`) rather than source code.
