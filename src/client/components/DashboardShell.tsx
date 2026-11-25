import React, { useEffect, useState } from 'react';
import {
  LogOut,
  Menu,
  QrCode,
  ShieldAlert,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../AuthContext';
import { apiRequest } from '../api';
import { navigate } from '../router';
import type { QrPassRecord } from '../../shared/types';
import { StatusLabel } from './UiPrimitives';

export interface ShellNavItem {
  id: string;
  label: string;
  group?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface DashboardShellProps {
  portalLabel: string;
  breadcrumbSection: string;
  departmentTheme?: string;
  navItems: ShellNavItem[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  portalLabel,
  breadcrumbSection,
  departmentTheme,
  navItems,
  activeTab,
  onSelectTab,
  actions,
  children,
}) => {
  const { effectiveActor, testSession, exitTestMode, signOut } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [myPass, setMyPass] = useState<QrPassRecord | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const resolvedDeptTheme =
    departmentTheme ||
    effectiveActor?.department_slug ||
    (effectiveActor?.role === 'executive_board' ? 'eb' : 'secretariat');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
        setQrModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openMyQr = async () => {
    setQrModalOpen(true);
    setQrLoading(true);
    try {
      const resp = await apiRequest<{ pass: QrPassRecord }>('/api/qr/my-pass');
      setMyPass(resp.pass);
    } catch {
      setMyPass(null);
    } finally {
      setQrLoading(false);
    }
  };

  const groups = Array.from(new Set(navItems.map((n) => n.group || 'Navigation')));

  const sidebarContent = (
    <div className="portal-sidebar-inner flex h-full flex-col text-[#E8E1D2]">
      <div className="portal-brand-block border-b border-[#263D59]/60 px-5 py-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="portal-wordmark block w-full text-left focus:outline-none"
        >
          <p className="font-display font-semibold text-[#F3EDE0] whitespace-nowrap">
            LIS MUN
          </p>
          <p
            className="mt-1.5 font-mono text-[10px] tracking-[0.2em] uppercase truncate"
            style={{ color: 'var(--dept-accent-muted, #B89A62)' }}
          >
            {portalLabel}
          </p>
        </button>
      </div>

      <nav aria-label="Portal Navigation" className="flex-1 overflow-y-auto px-3 py-5">
        {groups.map((grp, groupIndex) => {
          const items = navItems.filter((n) => (n.group || 'Navigation') === grp);
          return (
            <div
              key={grp}
              className={groupIndex > 0 ? 'mt-5 border-t border-[#263D59]/35 pt-4' : ''}
            >
              <p className="px-3 pb-2 font-mono text-[10px] tracking-[0.2em] text-[#E8E1D2]/42 uppercase">
                {grp}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTab(item.id);
                          setMobileDrawerOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`portal-nav-item flex w-full items-center gap-3 px-3 py-2 text-left font-sans text-[12.5px] font-medium tracking-wide ${
                          active ? 'portal-nav-item-active' : ''
                        }`}
                      >
                        {Icon && (
                          <Icon
                            className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                              active ? 'opacity-100' : 'opacity-65'
                            }`}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-[#263D59]/60 bg-[#030811]/75 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-sans text-xs font-medium text-[#F3EDE0]">
              {effectiveActor?.full_name || 'Authenticated Member'}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-[#E8E1D2]/55">
              {effectiveActor?.department_slug
                ? `${effectiveActor.department_slug}${effectiveActor.gender ? ` · ${effectiveActor.gender}` : ''}`
                : effectiveActor?.role}
            </p>
          </div>
        </div>
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={() => void signOut()}
            className="portal-btn-secondary w-full py-2 text-[10px]"
          >
            <LogOut className="h-3 w-3 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-portal-dept={resolvedDeptTheme}
      className="portal-app-shell min-h-screen text-[#E8E1D2]"
    >
      {/* Fixed Desktop Sidebar */}
      <aside className="portal-sidebar fixed inset-y-0 left-0 z-30 hidden w-[270px] border-r border-[#263D59]/60 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-[#02060E]/82 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <aside
            className="portal-drawer-enter h-full w-[270px] border-r border-[#B89A62]/40"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="lg:pl-[270px]">
        {testSession && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D5BD8B]/45 bg-[#151005] px-5 py-2.5 text-xs">
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#D5BD8B]">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                SUPER IT TEST MODE · Scoped strictly to{' '}
                <strong>
                  {testSession.departmentSlug}
                  {testSession.section ? ` (${testSession.section})` : ''}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => void exitTestMode()}
              className="portal-btn-primary py-1 text-[10px]"
            >
              Exit Test Mode
            </button>
          </div>
        )}

        <header className="portal-topbar sticky top-0 z-20 flex h-[64px] items-center justify-between gap-6 border-b border-[#263D59]/55 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#263D59] bg-[#050E1C] text-[#E8E1D2] transition-colors hover:border-[#B89A62] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2.5 font-mono text-[11px] tracking-[0.16em] uppercase">
              <span
                className="hidden whitespace-nowrap sm:inline"
                style={{ color: 'var(--dept-accent-muted, #B89A62)' }}
              >
                {portalLabel}
              </span>
              <span className="hidden text-[#263D59] sm:inline">/</span>
              <span className="truncate text-[#F3EDE0]">{breadcrumbSection}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {actions}
            <button
              type="button"
              onClick={() => void openMyQr()}
              className="portal-btn-primary py-1.5 text-[10px]"
            >
              <QrCode className="h-3.5 w-3.5 shrink-0" />
              <span>My QR</span>
            </button>
          </div>
        </header>

        <main className="portal-main-stage mx-auto min-h-[calc(100vh-64px)] max-w-[1440px] px-4 py-6 md:px-8 md:py-8 xl:px-10">
          <div key={activeTab} className="portal-panel-enter relative z-[1]">
            {children}
          </div>
        </main>
      </div>

      {/* My QR Modal */}
      {qrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#02060E]/88 p-4 backdrop-blur-sm"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="portal-modal-enter w-full max-w-sm border border-[#B89A62]/45 bg-[#061020] p-6 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#263D59]/60 pb-3.5">
              <p className="font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
                Conference Credential Pass
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                aria-label="Close QR pass"
                className="text-[#E8E1D2]/55 transition-colors hover:text-[#E8E1D2]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qrLoading ? (
              <p className="py-12 text-center font-mono text-xs text-[#E8E1D2]/60">
                Loading cryptographic QR pass...
              </p>
            ) : myPass ? (
              <div className="mt-6 flex flex-col items-center text-center">
                <div className="border border-[#B89A62]/70 bg-white p-4">
                  <QRCodeSVG value={myPass.token_value || myPass.pass_code} size={184} />
                </div>
                <p className="mt-5 font-display text-2xl text-[#F3EDE0]">{myPass.full_name}</p>
                <p className="mt-1 font-mono text-xs text-[#D5BD8B] tabular-nums">
                  {myPass.pass_code}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 border-t border-[#263D59]/50 pt-3.5">
                  <StatusLabel status={myPass.department_slug} tone="gold" />
                  <StatusLabel
                    status={myPass.inside ? 'Inside Venue' : 'Outside Venue'}
                    tone={myPass.inside ? 'green' : 'neutral'}
                  />
                </div>
              </div>
            ) : (
              <p className="py-10 text-center font-sans text-sm text-[#FCA5A5]">
                Unable to load QR pass. Verify Neon database connection.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
