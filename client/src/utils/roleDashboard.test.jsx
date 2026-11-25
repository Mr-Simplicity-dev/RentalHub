import fs from 'fs';
import path from 'path';
import { describe, test, expect } from 'vitest';
import {
  ALLOWED_POST_LOGIN_REDIRECT_PATHS,
  getDashboardPathForUser,
  normalizeUserRole,
} from './roleDashboard';
import workflow from '../propertyProtection/workflow.cjs';

const ALL_ROLE_EXPECTATIONS = [
  ['tenant', '/tenant/dashboard'],
  ['user', '/tenant/dashboard'],
  ['landlord', '/dashboard'],
  ['agent', '/agent/dashboard'],
  ['marketing_agent', '/marketing-agent/dashboard'],
  ['super_admin', '/super-admin'],
  ['admin', '/admin'],
  ['lga_admin', '/admin'],
  ['state_admin', '/admin'],
  ['state_financial_admin', '/admin'],
  ['zonal_admin', '/admin'],
  ['financial_admin', '/admin/financial-dashboard'],
  ['lga_financial_admin', '/admin/financial-dashboard'],
  ['zonal_financial_admin', '/admin/zonal-financial-dashboard'],
  ['super_financial_admin', '/admin/super-financial-dashboard'],
  ['lga_support_admin', '/admin/lga-support-dashboard'],
  ['state_support_admin', '/admin/state-support-dashboard'],
  ['zonal_support_admin', '/admin/zonal-support-dashboard'],
  ['super_support_admin', '/admin/super-support-dashboard'],
  ['recruitment_admin', '/admin/recruitment'],
  ['lawyer', '/lawyer'],
  ['state_lawyer', '/lawyer/state'],
  ['zonal_lawyer', '/lawyer/zonal'],
  ['super_lawyer', '/lawyer/super'],
  ['fumigation_admin', '/admin/fumigation-cleaning'],
  ['lga_fumigation_admin', '/admin/fumigation-cleaning'],
  ['state_fumigation_admin', '/admin/fumigation-cleaning/state'],
  ['zonal_fumigation_admin', '/admin/fumigation-cleaning/zonal'],
  ['super_fumigation_admin', '/admin/fumigation-cleaning/super'],
  ['transportation_admin', '/admin/transportation'],
  ['lga_transportation_admin', '/admin/transportation'],
  ['state_transportation_admin', '/admin/transportation/state'],
  ['zonal_transportation_admin', '/admin/transportation/zonal'],
  ['super_transportation_admin', '/super-admin/transportation'],
];

describe('roleDashboard routing contract across every platform role', () => {
  test.each(ALL_ROLE_EXPECTATIONS)(
    'maps %s to %s in both roleDashboard and propertyProtection workflow',
    (role, expectedPath) => {
      expect(getDashboardPathForUser({ user_type: role })).toBe(expectedPath);
      expect(getDashboardPathForUser({ user_type: ` ${role.toUpperCase()} ` })).toBe(expectedPath);
      expect(workflow.dashboardPathFor({ user_type: role })).toBe(expectedPath);

      const allowedByPostLoginRedirect = ALLOWED_POST_LOGIN_REDIRECT_PATHS.some(
        (prefix) => expectedPath === prefix || expectedPath.startsWith(`${prefix}/`)
      );
      expect(allowedByPostLoginRedirect).toBe(true);
    }
  );

  test('routes is_recruitment_admin flag to /admin/recruitment', () => {
    expect(getDashboardPathForUser({ user_type: 'lga_admin', is_recruitment_admin: true })).toBe(
      '/admin/recruitment'
    );
    expect(workflow.dashboardPathFor({ user_type: 'lga_admin', is_recruitment_admin: true })).toBe(
      '/admin/recruitment'
    );
  });

  test('returns fallback null for unknown roles so LandlordRoute never loops', () => {
    expect(normalizeUserRole('  Marketing_Agent ')).toBe('marketing_agent');
    expect(getDashboardPathForUser({ user_type: 'unknown_role' }, null)).toBeNull();
  });

  test('App.jsx allows zonal_financial_admin & zonal_support_admin in ADMIN_SHELL_ROLES and mounts /super-admin/transportation outside SuperAdminRoute', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../pages/App.jsx'), 'utf8');
    expect(appSource).toContain('...ZONAL_FINANCIAL_ADMIN_ROLES');
    expect(appSource).toContain('...ZONAL_SUPPORT_ADMIN_ROLES');
    expect(appSource).toContain('const SuperTransportationAdminRoute =');
    expect(appSource).toContain('path="/super-admin/transportation"');
    expect(appSource).not.toContain('<Route path="transportation" element={<TransportationSuperAdminDashboard />} />');
  });
});
