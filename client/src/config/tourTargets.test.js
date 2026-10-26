import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_META } from './roleHierarchy';
import { getTourDashboardRoute, getTourStepsByUserRole } from './tourConfig';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=new Map();
const corpus=(relative,seen=new Set())=>{
 const file=path.join(sourceRoot,relative);if(seen.has(file))return '';seen.add(file);
 if(!fs.existsSync(file))throw Error('Missing tour screen '+relative);
 const content=fs.readFileSync(file,'utf8');let result=content;
 for(const match of content.matchAll(/(?:from\s+|import\()['"]([^'"]+)['"]/g)){
  const specifier=match[1];if(!specifier.startsWith('.')||/(?:services|context|utils|hooks|i18n|config)/.test(specifier))continue;
  const base=path.resolve(path.dirname(file),specifier);
  const child=['.jsx','.js','/index.jsx','/index.js'].map(ext=>base+ext).find(p=>fs.existsSync(p));
  if(child)result+='\n'+corpus(path.relative(sourceRoot,child),seen);
 }
 return result;
};
const common=['components/common/Header.jsx','components/common/FloatingContactWidget.jsx','pages/admin/AdminLayout.jsx','pages/lawyer/LawyerLayout.jsx'].map(p=>corpus(p)).join('\n');
const sources={
 '/tenant/dashboard':'pages/Dashboard.jsx','/dashboard':'pages/Dashboard.jsx',
 '/agent/dashboard':'pages/agent/AgentDashboard.jsx','/marketing-agent/dashboard':'pages/marketing/MarketingAgentDashboard.jsx',
 '/lawyer':'pages/lawyer/LawyerDashboard.jsx','/lawyer/state':'pages/lawyer/StateLawyerDashboard.jsx','/lawyer/zonal':'pages/lawyer/ZonalLawyerDashboard.jsx','/lawyer/super':'pages/lawyer/SuperLawyerDashboard.jsx',
 '/super-admin':'pages/SuperAdminDashboard.jsx','/admin/recruitment':'pages/admin/RecruitmentAdminDashboard.jsx',
 '/admin/financial-dashboard':'pages/admin/FinancialAdminDashboard.jsx','/admin/zonal-financial-dashboard':'pages/admin/ZonalFinancialAdminDashboard.jsx','/admin/super-financial-dashboard':'pages/admin/SuperFinancialAdminDashboard.jsx',
 '/admin/lga-support-dashboard':'pages/admin/LgaSupportAdminDashboard.jsx','/admin/state-support-dashboard':'pages/admin/StateSupportAdminDashboard.jsx','/admin/super-support-dashboard':'pages/admin/SuperSupportAdminDashboard.jsx',
 '/admin/transportation':'pages/admin/TransportationAdminDashboard.jsx','/admin/transportation/state':'pages/admin/TransportationAdminStateDashboard.jsx','/admin/transportation/zonal':'pages/admin/TransportationAdminStateDashboard.jsx','/super-admin/transportation':'pages/admin/TransportationSuperAdminDashboard.jsx',
 '/admin/fumigation-cleaning':'pages/admin/LgaFumigationAdminDashboard.jsx','/admin/fumigation-cleaning/state':'pages/admin/StateFumigationAdminDashboard.jsx','/admin/fumigation-cleaning/zonal':'pages/admin/StateFumigationAdminDashboard.jsx','/admin/fumigation-cleaning/super':'pages/admin/SuperFumigationAdminDashboard.jsx',
};
it.each(Object.keys(ROLE_META))('%s tour selectors exist in the role dashboard component tree',role=>{
 const steps=getTourStepsByUserRole(role,undefined,{user:{user_type:role}});
 for(const step of steps){
  const route=(step.route||getTourDashboardRoute(role)).split('?')[0];
  const file=route==='/admin'?(['state_admin','state_financial_admin'].includes(role)?'pages/admin/StateAdminDashboard.jsx':'pages/admin/AdminDashboard.jsx'):sources[route];
  expect(file,role+' route '+route).toBeTruthy();
  if(!cache.has(file))cache.set(file,corpus(file)+common);
  const token=step.target.startsWith('[')?step.target.match(/="([^"]+)"/)?.[1]:step.target.slice(1);
  expect(cache.get(file).includes(token),role+': '+step.id+' target '+step.target+' absent from '+file).toBe(true);
 }
});
