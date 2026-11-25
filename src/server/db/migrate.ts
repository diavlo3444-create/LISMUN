import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_DEPARTMENTS } from '../../shared/permissions.ts';
import { getPool, isDatabaseConfigured, withTransaction } from './pool.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let migrationPromise: Promise<boolean> | null = null;

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    template_key: 'acceptance',
    name: 'Staff & Delegate Acceptance',
    subject: 'LIS MUN — Application Accepted ({department})',
    body_text:
      'Dear {name},\n\nCongratulations — your application to Leadership International School MUN ({department}) has been accepted.\n\nComplete your conference portal onboarding using your personal setup link below:\n{{signup_link}}\n\nWarm regards,\nLIS MUN Secretariat',
  },
  {
    template_key: 'rejection',
    name: 'Application Decision Update',
    subject: 'LIS MUN — Application Status Update ({department})',
    body_text:
      'Dear {name},\n\nThank you sincerely for applying to Leadership International School MUN ({department}). After careful review by our Secretariat and Directorate, we are unable to offer you a placement in this round.\n\nWe appreciate your interest and encourage you to stay engaged with future LIS MUN initiatives.\n\nWarm regards,\nLIS MUN Secretariat',
  },
  {
    template_key: 'waitlist',
    name: 'Application Waitlisted',
    subject: 'LIS MUN — Application Waitlisted ({department})',
    body_text:
      'Dear {name},\n\nThank you for applying to Leadership International School MUN ({department}). Your application has been placed on our priority waitlist, and our team will notify you immediately if a seat opens.\n\nWarm regards,\nLIS MUN Secretariat',
  },
  {
    template_key: 'delegate_acceptance',
    name: 'Delegate Matrix Acceptance',
    subject: 'LIS MUN — Delegate Registration Confirmed',
    body_text:
      'Dear {name},\n\nYour registration for Leadership International School MUN has been confirmed for {institution}. Further committee dossier details and payment instructions will follow shortly.\n\nWarm regards,\nLIS MUN Delegate & Committee Coordination',
  },
] as const;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  registration_open: true,
  chair_registration_open: true,
  team_security_open: true,
  team_media_open: true,
  team_press_open: true,
  team_volunteers_open: true,
  early_bird_opens: '2026-09-01T00:00:00Z',
  early_bird_closes: '2027-01-15T23:59:59Z',
  regular_opens: '2027-01-16T00:00:00Z',
  regular_closes: '2027-04-30T23:59:59Z',
  fee_early_bird: 150,
  fee_regular: 200,
  cms_hero_subtitle: 'Leadership International School Model United Nations',
  cms_hero_tagline: 'An assembly of voices, nations, and ideas shaping the future through diplomacy.',
  cms_conference_dates: 'Session I · Dates Forthcoming',
  cms_venue_name: 'Leadership International School Campus',
};

export async function runMigrationsAndSeed(): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    return false;
  }
  if (migrationPromise) {
    return migrationPromise;
  }

  migrationPromise = (async () => {
    const migrationPath = path.resolve(
      __dirname,
      'migrations/001_lismun_core_schema.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const pool = getPool();
    await pool.query(sql);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO schema_migrations (version)
         VALUES ('001_lismun_core_schema')
         ON CONFLICT (version) DO NOTHING`
      );

      for (const dept of CORE_DEPARTMENTS) {
        await client.query(
          `INSERT INTO departments (slug, name, description, is_sectioned, has_public_intake, registration_open)
           VALUES ($1, $2, $3, $4, $5, true)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             is_sectioned = EXCLUDED.is_sectioned,
             has_public_intake = EXCLUDED.has_public_intake`,
          [
            dept.slug,
            dept.name,
            dept.description,
            dept.isSectioned,
            dept.hasPublicIntake,
          ]
        );
      }

      for (const tpl of DEFAULT_EMAIL_TEMPLATES) {
        await client.query(
          `INSERT INTO email_templates (template_key, name, subject, body_text)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (template_key) DO NOTHING`,
          [tpl.template_key, tpl.name, tpl.subject, tpl.body_text]
        );
      }

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await client.query(
          `INSERT INTO settings (key, value)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (key) DO NOTHING`,
          [key, JSON.stringify(value)]
        );
      }
    });

    return true;
  })().catch((err) => {
    migrationPromise = null;
    throw err;
  });

  return migrationPromise;
}

export function resetMigrationCacheForTests(): void {
  migrationPromise = null;
}
