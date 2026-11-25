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
  navItems: ShellNavItem[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  portalLabel,
  breadcrumbSection,
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
    <div className="flex h-full flex-col bg-[#040B18] text-[#E8E1D2]">
      <div className="border-b border-[#263D59]/70 px-5 py-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-left focus:outline-none"
        >
          <p className="font-display text-xl font-semibold tracking-[0.18em] text-[#E8E1D2]">
            LISMUN
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-[#B89A62] uppercase">
            {portalLabel}
          </p>
        </button>
      </div>

      <nav aria-label="Portal Navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((grp) => {
          const items = navItems.filter((n) => (n.group || 'Navigation') === grp);
          return (
            <div key={grp} className="mb-5">
              <p className="px-2.5 pb-1.5 font-mono text-[10px] tracking-[0.2em] text-[#E8E1D2]/45 uppercase">
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
                        className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left font-sans text-xs font-medium tracking-wide transition-colors ${
                          active
                            ? 'border-[#D5BD8B] bg-[#071426] text-[#D5BD8B]'
                            : 'border-transparent text-[#E8E1D2]/72 hover:bg-[#071426]/60 hover:text-[#E8E1D2]'
                        }`}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
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

      <div className="border-t border-[#263D59]/70 p-4">
        <p className="truncate font-sans text-xs font-medium text-[#E8E1D2]">
          {effectiveActor?.full_name || 'Authenticated Member'}
        </p>
        <p className="truncate font-mono text-[10px] text-[#E8E1D2]/55">
          {effectiveActor?.department_slug
            ? `${effectiveActor.department_slug}${effectiveActor.gender ? ` · ${effectiveActor.gender}` : ''}`
            : effectiveActor?.role}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 border border-[#263D59] bg-[#030914] px-3 py-2 font-mono text-[10px] tracking-[0.15em] text-[#E8E1D2]/80 uppercase hover:border-[#B89A62] hover:text-[#D5BD8B]"
          >
            <LogOut className="h-3 w-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#030914] text-[#E8E1D2]">
      {/* Fixed Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-[#263D59]/70 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-[#030914]/85 lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <aside
            className="h-full w-[270px] border-r border-[#B89A62]/45"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="lg:pl-[260px]">
        {testSession && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D5BD8B]/60 bg-[#1B1406] px-4 py-2.5 text-xs">
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
              className="border border-[#D5BD8B] bg-[#030914] px-3 py-1 font-mono text-[10px] tracking-[0.14em] text-[#D5BD8B] uppercase hover:bg-[#071426]"
            >
              Exit Test Mode
            </button>
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[#263D59]/70 bg-[#030914]/96 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center border border-[#263D59] text-[#E8E1D2] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase">
              <span className="hidden text-[#B89A62] sm:inline">{portalLabel}</span>
              <span className="hidden text-[#263D59] sm:inline">/</span>
              <span className="truncate text-[#E8E1D2]">{breadcrumbSection}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {actions}
            <button
              type="button"
              onClick={() => void openMyQr()}
              className="inline-flex items-center gap-1.5 border border-[#B89A62]/60 bg-[#071426] px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-[#D5BD8B] uppercase whitespace-nowrap hover:border-[#D5BD8B]"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>My QR</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</main>
      </div>

      {/* My QR Modal */}
      {qrModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#030914]/90 p-4"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="w-full max-w-sm border border-[#B89A62]/55 bg-[#071426] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#263D59]/70 pb-3">
              <p className="font-mono text-xs tracking-[0.18em] text-[#B89A62] uppercase">
                Conference Credential Pass
              </p>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                aria-label="Close QR pass"
                className="text-[#E8E1D2]/60 hover:text-[#E8E1D2]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qrLoading ? (
              <p className="py-10 text-center font-mono text-xs text-[#E8E1D2]/60">
                Loading cryptographic QR pass...
              </p>
            ) : myPass ? (
              <div className="mt-5 flex flex-col items-center text-center">
                <div className="border border-[#B89A62] bg-white p-4">
                  <QRCodeSVG value={myPass.token_value || myPass.pass_code} size={184} />
                </div>
                <p className="mt-4 font-display text-2xl text-[#E8E1D2]">{myPass.full_name}</p>
                <p className="mt-1 font-mono text-xs text-[#D5BD8B] tabular-nums">
                  {myPass.pass_code}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <StatusLabel status={myPass.department_slug} tone="gold" />
                  <StatusLabel
                    status={myPass.inside ? 'Inside Venue' : 'Outside Venue'}
                    tone={myPass.inside ? 'green' : 'neutral'}
                  />
                </div>
              </div>
            ) : (
              <p className="py-8 text-center font-sans text-sm text-[#FCA5A5]">
                Unable to load QR pass. Verify Neon database connection.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
