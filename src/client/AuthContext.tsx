import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, setAuthTokens } from './api';
import { navigate } from './router';
import { ALL_PERMISSION_KEYS } from '../shared/permissions';
import type {
  DepartmentRecord,
  GenderSection,
  PermissionKey,
  PortalKey,
  SystemStatusResponse,
  TestSessionContext,
  UserProfile,
} from '../shared/types';

interface AuthContextValue {
  ready: boolean;
  systemStatus: SystemStatusResponse | null;
  user: UserProfile | null;
  effectiveActor: UserProfile | null;
  resolvedPermissions: Record<PermissionKey, boolean>;
  departments: DepartmentRecord[];
  testSession: TestSessionContext | null;
  refreshStatusAndSession: () => Promise<void>;
  signIn: (params: {
    email: string;
    password: string;
    expectedPortal?: PortalKey;
  }) => Promise<{ user: UserProfile }>;
  claimSuperAdmin: (params: {
    email: string;
    full_name: string;
    password: string;
  }) => Promise<{ user: UserProfile }>;
  signOut: () => Promise<void>;
  launchAndEnterTestMode: (departmentSlug: string, section?: GenderSection | null) => Promise<void>;
  launchAndEnterAccountTestMode: (userId: string) => Promise<void>;
  consumeTestTicket: (ticket: string) => Promise<void>;
  exitTestMode: () => Promise<void>;
}

const EMPTY_PERMS = Object.fromEntries(
  ALL_PERMISSION_KEYS.map((k) => [k, false])
) as Record<PermissionKey, boolean>;

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [effectiveActor, setEffectiveActor] = useState<UserProfile | null>(null);
  const [resolvedPermissions, setResolvedPermissions] =
    useState<Record<PermissionKey, boolean>>(EMPTY_PERMS);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [testSession, setTestSession] = useState<TestSessionContext | null>(null);

  const refreshStatusAndSession = useCallback(async () => {
    try {
      const [statusResp, sessResp] = await Promise.all([
        apiRequest<SystemStatusResponse>('/api/system/status'),
        apiRequest<{
          authenticated: boolean;
          user: UserProfile | null;
          effectiveActor: UserProfile | null;
          resolvedPermissions?: Record<PermissionKey, boolean>;
          testSession?: TestSessionContext | null;
          departments?: DepartmentRecord[];
        }>('/api/auth/session'),
      ]);
      setSystemStatus(statusResp);
      if (sessResp.authenticated && sessResp.user) {
        setUser(sessResp.user);
        setEffectiveActor(sessResp.effectiveActor || sessResp.user);
        setResolvedPermissions(sessResp.resolvedPermissions || EMPTY_PERMS);
        setTestSession(sessResp.testSession || null);
        setDepartments(sessResp.departments || []);
      } else {
        setUser(null);
        setEffectiveActor(null);
        setResolvedPermissions(EMPTY_PERMS);
        setTestSession(null);
      }
    } catch {
      // Offline / startup fallback
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshStatusAndSession();
  }, [refreshStatusAndSession]);

  const signIn = useCallback(
    async (params: { email: string; password: string; expectedPortal?: PortalKey }) => {
      const resp = await apiRequest<{
        token: string;
        user: UserProfile;
        resolvedPermissions: Record<PermissionKey, boolean>;
        departments: DepartmentRecord[];
      }>('/api/auth/login', {
        method: 'POST',
        body: params,
        skipAuth: true,
      });
      setAuthTokens({ bearerToken: resp.token, testSessionToken: null });
      setUser(resp.user);
      setEffectiveActor(resp.user);
      setResolvedPermissions(resp.resolvedPermissions || EMPTY_PERMS);
      setDepartments(resp.departments || []);
      setTestSession(null);
      return { user: resp.user };
    },
    []
  );

  const claimSuperAdmin = useCallback(
    async (params: { email: string; full_name: string; password: string }) => {
      const resp = await apiRequest<{
        token: string;
        user: UserProfile;
        resolvedPermissions: Record<PermissionKey, boolean>;
      }>('/api/auth/claim-super-admin', {
        method: 'POST',
        body: params,
        skipAuth: true,
      });
      setAuthTokens({ bearerToken: resp.token, testSessionToken: null });
      setUser(resp.user);
      setEffectiveActor(resp.user);
      setResolvedPermissions(resp.resolvedPermissions || EMPTY_PERMS);
      await refreshStatusAndSession();
      return { user: resp.user };
    },
    [refreshStatusAndSession]
  );

  const signOut = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore error on logout
    }
    setAuthTokens({ bearerToken: null, testSessionToken: null });
    setUser(null);
    setEffectiveActor(null);
    setResolvedPermissions(EMPTY_PERMS);
    setTestSession(null);
    navigate('/portal');
  }, []);

  const consumeTestTicket = useCallback(
    async (ticket: string) => {
      const resp = await apiRequest<{ sessionToken: string }>('/api/super-admin/test-mode/consume', {
        method: 'POST',
        body: { launchTicket: ticket },
      });
      setAuthTokens({ testSessionToken: resp.sessionToken });
      await refreshStatusAndSession();
    },
    [refreshStatusAndSession]
  );

  const launchAndEnterTestMode = useCallback(
    async (departmentSlug: string, section?: GenderSection | null) => {
      const resp = await apiRequest<{ launchTicket: string }>('/api/super-admin/test-mode/launch', {
        method: 'POST',
        body: { department_slug: departmentSlug, section: section ?? null },
      });
      await consumeTestTicket(resp.launchTicket);
      navigate('/head');
    },
    [consumeTestTicket]
  );

  const launchAndEnterAccountTestMode = useCallback(
    async (userId: string) => {
      const resp = await apiRequest<{ launchTicket: string }>('/api/super-admin/test-mode/launch', {
        method: 'POST',
        body: { user_id: userId },
      });
      await consumeTestTicket(resp.launchTicket);
      navigate('/head');
    },
    [consumeTestTicket]
  );

  const exitTestMode = useCallback(async () => {
    try {
      if (testSession) {
        await apiRequest('/api/super-admin/test-mode/terminate', {
          method: 'POST',
          body: {
            department_slug: testSession.departmentSlug,
            section: testSession.section,
            target_user_id: testSession.targetUserId ?? null,
          },
        });
      }
    } catch {
      // Ignore audit log failure on exit
    }
    setAuthTokens({ testSessionToken: null });
    await refreshStatusAndSession();
    navigate('/super-admin');
  }, [testSession, refreshStatusAndSession]);

  return (
    <AuthContext.Provider
      value={{
        ready,
        systemStatus,
        user,
        effectiveActor,
        resolvedPermissions,
        departments,
        testSession,
        refreshStatusAndSession,
        signIn,
        claimSuperAdmin,
        signOut,
        launchAndEnterTestMode,
        launchAndEnterAccountTestMode,
        consumeTestTicket,
        exitTestMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
