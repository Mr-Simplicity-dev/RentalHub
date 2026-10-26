import { describe, expect, it } from 'vitest';
import { getTourStepsByUserRole, getTourDashboardRoute, TOUR_STEPS } from './tourConfig';
import { getWorkflowToursByUserRole } from './tourWorkflows';

const roles = ['admin','lga_admin','zonal_admin','state_admin','state_financial_admin','financial_admin','lga_financial_admin','super_financial_admin','lga_support_admin','state_support_admin','super_support_admin','transportation_admin','lga_transportation_admin','state_transportation_admin','super_transportation_admin','fumigation_admin','lga_fumigation_admin','state_fumigation_admin','super_fumigation_admin','recruitment_admin','super_admin','zonal_financial_admin','zonal_transportation_admin','zonal_fumigation_admin','zonal_lawyer'];
const stepsFor = role => getTourStepsByUserRole(role, undefined, {user:{user_type:role}});

describe('current administrative tours', () => {
  it.each(roles)('%s exposes its role tour with distinct usable targets', role => {
    const steps = stepsFor(role);
    expect(steps.length).toBeGreaterThan(4);
    expect(new Set(steps.map(step=>step.id)).size).toBe(steps.length);
    expect(steps.every(step=>step.target && step.title && step.description)).toBe(true);
  });
  it('includes request review in the selectable LGA workflow without exposing it to zonal roles', () => {
    expect(getWorkflowToursByUserRole('lga_admin').flatMap(flow=>flow.steps).some(step=>step.id==='admin_property_requests')).toBe(true);
    expect(getWorkflowToursByUserRole('zonal_admin').flatMap(flow=>flow.steps).some(step=>step.id==='admin_property_requests')).toBe(false);
  });
  it('keeps request assignment within the permitted administrative scope', () => {
    expect(stepsFor('lga_admin').find(step=>step.id==='admin_property_requests')?.route).toBe('/admin?tab=property_requests');
    expect(stepsFor('zonal_admin').some(step=>step.id==='admin_property_requests')).toBe(false);
    expect(stepsFor('state_admin').find(step=>step.id==='state_property_requests')?.route).toBe('/admin?tab=property_requests');
  });
  it('takes Super Admin to the actual request, volunteer, pricing and account workspaces', () => {
    const routes = Object.fromEntries(stepsFor('super_admin').map(step=>[step.id,step.route]));
    expect(routes.super_request_review).toBe('/super-admin?tab=property_requests');
    expect(routes.super_volunteer_control).toBe('/super-admin?tab=recruitment');
    expect(routes.super_pricing_current).toBe('/super-admin?tab=pricing');
    expect(routes.super_admin_accounts_current).toBe('/super-admin?tab=admin');
    expect(routes.super_pending_current).toBe('/super-admin?tab=pending_approvals');
    for(let i=1;i<=6;i++) expect(routes['super_'+i]).toBe('/super-admin?tab=overview');
  });
  it('describes free volunteer review without mandatory interviews', () => {
    const copy=TOUR_STEPS.RECRUITMENT_ADMIN_DASHBOARD.map(step=>step.description).join(' ');
    expect(copy).toContain('Volunteer fees are always zero');
    expect(copy).toContain('manual follow-up');
    expect(copy).toContain('Not Applicable');
    expect(copy).toContain('interviews are not automatic');
  });
});

const zonalRoutes = { zonal_financial_admin: '/admin/zonal-financial-dashboard', zonal_transportation_admin: '/admin/transportation/zonal', zonal_fumigation_admin: '/admin/fumigation-cleaning/zonal', zonal_lawyer: '/lawyer/zonal' };
it.each(Object.entries(zonalRoutes))('%s uses its own dashboard and workflow instead of tenant guidance', (role,route) => {
 expect(getTourDashboardRoute(role)).toBe(route);
 const steps = stepsFor(role);
 expect(steps.some(step=>step.id.startsWith('tenant_'))).toBe(false);
 expect(getWorkflowToursByUserRole(role).flatMap(flow=>flow.steps).some(step=>step.target===steps.find(item=>!item.id.startsWith('header_')&&!item.id.includes('sidebar_')).target)).toBe(true);
 if(role!=='zonal_lawyer')expect(steps.filter(step=>!step.id.startsWith('header_')&&!step.id.includes('sidebar_')).every(step=>step.route?.startsWith(route))).toBe(true);
});
