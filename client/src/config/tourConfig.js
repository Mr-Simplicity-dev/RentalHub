/**
 * Tour Configuration for all RentalHub Dashboards
 * Each dashboard has its own tour steps with descriptions
 */

export const TOUR_STEPS = {
  // Tenant/Regular User Dashboard
  TENANT_DASHBOARD: [
    {
      id: 'tenant_1',
      target: '.tour-saved-properties',
      title: 'Your Properties',
      description: 'Open your saved or listed properties from here and continue the next action from your dashboard.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'tenant_2',
      target: '.tour-property-location',
      title: 'Property Location',
      description: 'After rent payment is confirmed, this area lets you open eligible property locations in Google Maps.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'tenant_3',
      target: '.tour-wallet',
      title: 'Wallet & Payments',
      description: 'Check wallet balances, withdrawals, rent savings, refunds, and payment-related actions from your dashboard.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'tenant_4',
      target: '.tour-recent-activity',
      title: 'Recent Activity',
      description: 'Review the latest applications, payments, messages, and property activity connected to your account.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'tenant_5',
      target: '.tour-quick-actions',
      title: 'Quick Actions',
      description: 'Use these shortcuts to jump into common tasks like browsing properties, checking messages, and managing payments.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'tenant_6',
      target: '.tour-legal-help',
      title: 'Request Legal Help',
      description: 'If you have Legal Protection Coverage, submit a legal assistance request and a qualified lawyer will be assigned to help you.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'tenant_7',
      target: '.tour-support-widget',
      title: 'Chat Support',
      description: 'Need help? Click here to chat with our support team. You can start a conversation, view your tickets, and get real-time responses.',
      placement: 'left',
      highlight: true,
    },
  ],

  LANDLORD_DASHBOARD: [
    {
      id: 'landlord_1',
      target: '.tour-saved-properties',
      title: 'Your Listings',
      description: 'Open your listed properties and manage availability, applications, and listing details.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'landlord_2',
      target: '.tour-messages',
      title: 'Messages',
      description: 'Check unread messages and continue conversations with tenants or applicants.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'landlord_3',
      target: '.tour-wallet',
      title: 'Withdrawals',
      description: 'Review available balances and start withdrawal actions from your landlord dashboard.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'landlord_4',
      target: '.tour-recent-activity',
      title: 'Recent Activity',
      description: 'Track the latest applications, property activity, messages, and payment updates.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'landlord_5',
      target: '.tour-quick-actions',
      title: 'Quick Actions',
      description: 'Use these shortcuts to list properties, view applications, manage messages, and handle payments.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'landlord_6',
      target: '.tour-legal-help',
      title: 'Request Legal Help',
      description: 'If you have Legal Protection Coverage, submit a legal assistance request and a qualified lawyer will be assigned to help you.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'landlord_7',
      target: '.tour-support-widget',
      title: 'Chat Support',
      description: 'Need help? Click here to chat with our support team. You can start a conversation, view your tickets, and get real-time responses.',
      placement: 'left',
      highlight: true,
    },
  ],

  // Agent Dashboard
  AGENT_DASHBOARD: [
    {
      id: 'agent_1',
      target: '.agent-commissions-section',
      title: 'State Migration',
      description: 'Request an assignment-state change here and follow the status of recent migration requests.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'agent_2',
      target: '.agent-bookings-section',
      title: 'Assigned Landlord',
      description: 'Review the landlord assignment, contact details, and operational status connected to your agent account.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'agent_3',
      target: '.agent-earnings-section',
      title: 'Agent Tools',
      description: 'Open property management, earnings, and withdrawal tools from these quick actions.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'agent_4',
      target: '.agent-profile-section',
      title: 'Your Profile',
      description: 'Update your profile information, verification status, and bank details.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Lawyer Dashboard
  LAWYER_DASHBOARD: [
    {
      id: 'lawyer_1',
      target: '.lawyer-cases-section',
      title: 'Active Cases',
      description: 'View and manage all disputes you\'re handling. Check case status and updates.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'lawyer_2',
      target: '[data-tour-id="lawyer-evidence-verification"]',
      title: 'Evidence Review',
      description: 'Open the integrity verification tool to authenticate evidence and review its verification trail.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'lawyer_3',
      target: '.lawyer-clients-section',
      title: 'Your Clients',
      description: 'Manage client information and case documents. Track case progress.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'lawyer_4',
      target: '.lawyer-earnings-section',
      title: 'Earnings',
      description: 'View earnings from case resolutions and evidence verification payouts.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Admin Dashboard
  ADMIN_DASHBOARD: [
    {
      id: 'admin_1',
      target: '.admin-users-section',
      title: 'User Management',
      description: 'Manage all platform users, verify identities, and handle user-related issues.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'admin_2',
      target: '.admin-properties-section',
      title: 'Properties Management',
      description: 'Monitor and moderate all property listings. Handle compliance and approvals.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'admin_3',
      target: '.admin-disputes-section',
      title: 'Applications',
      description: 'See the application workload for properties within your administrative scope.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'admin_4',
      target: '.admin-payments-section',
      title: 'Pending Verifications',
      description: 'Monitor identity and document verifications that still require administrative review.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'admin_5',
      target: '.admin-reports-section',
      title: 'Administration Tools',
      description: 'Jump directly to users, properties, applications, verification, lawyer, and agent workflows.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Financial Admin Dashboard
  FINANCIAL_ADMIN_DASHBOARD: [
    {
      id: 'fin_admin_1',
      target: '.fin-admin-payments-section',
      route: '/admin/financial-dashboard?tab=overview',
      title: 'Transaction Management',
      description: 'Monitor all financial transactions on the platform.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'fin_admin_2',
      target: '.fin-admin-settlements-section',
      route: '/admin/financial-dashboard?tab=state-admins',
      title: 'State Admin Performance',
      description: 'Review state-level commission, pending balance, payout, and managed-user performance.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fin_admin_3',
      target: '.fin-admin-refunds-section',
      route: '/admin/financial-dashboard?tab=frozen-funds',
      title: 'Frozen Funds',
      description: 'Review funds held for financial investigation and manage the freeze workflow.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fin_admin_4',
      target: '.fin-admin-reports-section',
      route: '/admin/financial-dashboard?tab=overview',
      title: 'Financial Workspace',
      description: 'Move between transactions, administrators, frozen funds, withdrawals, escalations, and the audit trail.',
      placement: 'top',
      highlight: true,
    },
  ],

  // LGA Financial Admin Dashboard
  LGA_FINANCIAL_ADMIN_DASHBOARD: [
    {
      id: 'lga_fin_admin_1',
      target: '#lga-finance-overview',
      route: '/admin/financial-dashboard',
      title: 'Local Finance Overview',
      description: 'Review your withdrawable commission, total earnings, and pending requests for the assigned LGA.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'lga_fin_admin_2',
      target: '.lga-finance-withdrawal-action',
      route: '/admin/financial-dashboard',
      title: 'Request a Withdrawal',
      description: 'Start a secure withdrawal request using your verified account and current available balance.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'lga_fin_admin_3',
      target: '#lga-finance-withdrawals',
      route: '/admin/financial-dashboard',
      title: 'Withdrawal History',
      description: 'Track every request, destination bank, amount, date, and approval status from this history.',
      placement: 'top',
      highlight: true,
    },
  ],

  // State / State Financial Admin Dashboard
  STATE_ADMIN_DASHBOARD: [
    {
      id: 'state_admin_1',
      target: '.state-admin-overview-section',
      route: '/admin?tab=overview',
      title: 'State Operations',
      description: 'See your assigned jurisdiction, commission rate, and direct links into state-level work.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'state_admin_2',
      target: '.state-admin-finance-section',
      route: '/admin?tab=overview',
      title: 'Financial Snapshot',
      description: 'Monitor wallet balance, pending commission, managed users, and property coverage at a glance.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'state_admin_3',
      target: '.state-admin-withdrawal-section',
      route: '/admin?tab=overview',
      title: 'Commission Withdrawal',
      description: 'Submit a withdrawal request using the approved weekly allowance and verified bank details.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'state_admin_4',
      target: '.state-admin-tools-section',
      route: '/admin?tab=overview',
      title: 'State Administration Tools',
      description: 'Open commissions, transactions, users, withdrawals, and local-government oversight from this workspace.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Super Financial Admin Dashboard
  SUPER_FINANCIAL_ADMIN_DASHBOARD: [
    {
      id: 'super_fin_admin_1',
      target: '#super-financial-overview',
      route: '/admin/super-financial-dashboard?panel=overview',
      title: 'National Financial Command',
      description: 'Access platform-wide exports, personal withdrawals, and the national withdrawal-review queue.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'super_fin_admin_2',
      target: '#super-financial-transactions',
      route: '/admin/super-financial-dashboard?panel=transactions',
      title: 'Transaction Oversight',
      description: 'Review recent transactions, wallet credits, payment types, dates, and exportable financial records.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'super_fin_admin_3',
      target: '#super-financial-state-performance',
      route: '/admin/super-financial-dashboard?panel=state-performance',
      title: 'State Performance',
      description: 'Compare transaction activity, pending commission, and withdrawals across state financial teams.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_fin_admin_4',
      target: '#super-financial-pending-withdrawals',
      route: '/admin/super-financial-dashboard?panel=pending-withdrawals',
      title: 'Withdrawal Decisions',
      description: 'Approve or reject administrator withdrawal requests and review the latest financial decisions.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Transportation Admin Dashboard
  TRANSPORTATION_ADMIN_DASHBOARD: [
    {
      id: 'trans_admin_1',
      target: '.trans-admin-bookings-section',
      title: 'Transportation Bookings',
      description: 'View and manage all transportation bookings in your area.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'trans_admin_2',
      target: '.trans-admin-routes-section',
      title: 'Route Management',
      description: 'Manage transportation routes and pricing.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'trans_admin_3',
      target: '.trans-admin-drivers-section',
      title: 'Driver Management',
      description: 'Manage drivers, ratings, and assignments.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'trans_admin_4',
      target: '.trans-admin-revenue-section',
      title: 'Revenue Tracking',
      description: 'Monitor transportation revenue and earnings.',
      placement: 'top',
      highlight: true,
    },
  ],

  // State Transportation Admin Dashboard
  STATE_TRANSPORTATION_ADMIN_DASHBOARD: [
    {
      id: 'state_trans_admin_1',
      target: '.state-trans-overview-section',
      route: '/admin/transportation/state?tab=overview',
      title: 'State Logistics Overview',
      description: 'Monitor bookings, revenue, tenant activity, alerts, and service performance within your state.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'state_trans_admin_2',
      target: '.state-trans-bookings-section',
      route: '/admin/transportation/state?tab=bookings',
      title: 'State Booking Queue',
      description: 'Review every transportation booking connected to properties inside your assigned jurisdiction.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'state_trans_admin_3',
      target: '.state-trans-services-section',
      route: '/admin/transportation/state?tab=services',
      title: 'Service Activity',
      description: 'Review the providers, pricing, availability, and booking activity visible in your state.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'state_trans_admin_4',
      target: '.state-trans-jurisdiction-section',
      route: '/admin/transportation/state?tab=jurisdiction',
      title: 'Assigned Jurisdiction',
      description: 'Confirm the state or city scope and operational permissions assigned to this account.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Super Transportation Admin Dashboard
  SUPER_TRANSPORTATION_ADMIN_DASHBOARD: [
    {
      id: 'super_trans_admin_1',
      target: '.super-trans-overview-section',
      route: '/super-admin/transportation?tab=overview',
      title: 'National Logistics Overview',
      description: 'See national bookings, revenue, tenant activity, state distribution, and critical alerts.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'super_trans_admin_2',
      target: '.super-trans-jurisdictions-section',
      route: '/super-admin/transportation?tab=state-admins',
      title: 'State Jurisdictions',
      description: 'Assign transportation scope and permissions to state administrators and review active assignments.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'super_trans_admin_3',
      target: '.super-trans-alerts-section',
      route: '/super-admin/transportation?tab=alerts',
      title: 'National Alert Queue',
      description: 'Review and resolve warning or critical transportation events from monitored jurisdictions.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'super_trans_admin_4',
      target: '.super-trans-health-section',
      route: '/super-admin/transportation?tab=health',
      title: 'System Health',
      description: 'Track daily logistics health, active services, live revenue, bookings, and alert severity.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Fumigation Admin Dashboard
  FUMIGATION_ADMIN_DASHBOARD: [
    {
      id: 'fum_admin_1',
      target: '.fum-admin-bookings-section',
      title: 'Fumigation Bookings',
      description: 'Manage all fumigation and cleaning service bookings.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'fum_admin_2',
      target: '.fum-admin-services-section',
      title: 'Service Management',
      description: 'Manage available services, pricing, and packages.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fum_admin_3',
      target: '.fum-admin-providers-section',
      title: 'Service Providers',
      description: 'Manage fumigation service providers and their performance.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fum_admin_4',
      target: '.fum-admin-payments-section',
      title: 'Payment & Revenue',
      description: 'Track payments and revenue from fumigation services.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Super Fumigation Admin Dashboard
  SUPER_FUMIGATION_ADMIN_DASHBOARD: [
    {
      id: 'super_fum_admin_1',
      target: '.super-fum-overview-section',
      title: 'National Service Overview',
      description: 'Monitor nationwide bookings, revenue, provider coverage, and service completion performance.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'super_fum_admin_2',
      target: '.super-fum-operations-section',
      title: 'Operational Health',
      description: 'See which service jobs are awaiting action, active, completed, or cancelled.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'super_fum_admin_3',
      target: '.super-fum-bookings-section',
      title: 'National Bookings',
      description: 'Review recent fumigation and cleaning jobs, locations, status, dates, and transaction values.',
      placement: 'top',
      highlight: true,
    },
    {
      id: 'super_fum_admin_4',
      target: '.super-fum-providers-section',
      title: 'Provider Coverage',
      description: 'Review active provider quality, rating, and completed-job coverage across the platform.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Recruitment Admin Dashboard
  RECRUITMENT_ADMIN_DASHBOARD: [
    {
      id: 'rec_admin_1',
      target: '.recruitment-admin-overview-section',
      route: '/admin/recruitment?tab=overview',
      title: 'Recruitment Overview',
      description: 'Monitor applicants, collected fees, completed interviews, and active recruitment locations.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'rec_admin_2',
      target: '.recruitment-admin-cycles-section',
      route: '/admin/recruitment?tab=cycles',
      title: 'Recruitment Cycles',
      description: 'Create and manage recruitment cycles, timelines, and the intake periods available to applicants.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'rec_admin_3',
      target: '.recruitment-admin-applicants-section',
      route: '/admin/recruitment?tab=applicants',
      title: 'Candidate Management',
      description: 'Filter applicants, review candidate records, export results, and move applications through hiring stages.',
      placement: 'left',
      highlight: true,
    },
  ],

  // LGA Support Admin Dashboard
  LGA_SUPPORT_DASHBOARD: [
    {
      id: 'lga_support_1',
      target: '.lga-support-tickets-section',
      route: '/admin/lga-support-dashboard?tab=tickets',
      title: 'Support Tickets',
      description: 'View and manage all support tickets. Assign tickets to yourself and resolve user issues.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'lga_support_2',
      target: '.lga-support-property-requests-section',
      route: '/admin/lga-support-dashboard?tab=property_requests',
      title: 'Property Requests',
      description: 'Review and approve property listing requests from landlords and agents in your LGA.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'lga_support_3',
      target: '.lga-support-tenancy-section',
      route: '/admin/lga-support-dashboard?tab=tenancy',
      title: 'Tenancy Operations',
      description: 'Enable grace periods and refunds for tenants in your area.',
      placement: 'top',
      highlight: true,
    },
  ],

  // State Support Admin Dashboard
  STATE_SUPPORT_DASHBOARD: [
    {
      id: 'state_support_1',
      target: '.state-support-stats-section',
      route: '/admin/state-support-dashboard?tab=overview',
      title: 'Dashboard Overview',
      description: 'View pending migration requests and quick stats for your state.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'state_support_2',
      target: '.state-support-migration-section',
      route: '/admin/state-support-dashboard?tab=queue',
      title: 'Migration Queue',
      description: 'Review outgoing and incoming state migration requests from agents and lawyers.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'state_support_3',
      target: '.state-support-property-requests-section',
      route: '/admin/state-support-dashboard?tab=property_requests',
      title: 'Property Requests',
      description: 'Review property listing requests and tenancy operations for your state.',
      placement: 'left',
      highlight: true,
    },
  ],

  // Super Support Admin Dashboard
  SUPER_SUPPORT_DASHBOARD: [
    {
      id: 'super_support_1',
      target: '.super-support-overview-section',
      route: '/admin/super-support-dashboard?tab=overview',
      title: 'Operational Overview',
      description: 'View migration stats, ticket counts, system alerts, and commission health at a glance.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'super_support_2',
      target: '.super-support-migration-section',
      route: '/admin/super-support-dashboard?tab=queue',
      title: 'Migration Queue',
      description: 'Full migration queue with filters, approve/reject, and CSV export.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_support_3',
      target: '.super-support-tickets-section',
      route: '/admin/super-support-dashboard?tab=tickets',
      title: 'Support Tickets',
      description: 'Manage all support tickets — resolve, escalate, or assign to team members.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_support_4',
      target: '.super-support-audit-section',
      route: '/admin/super-support-dashboard?tab=audit',
      title: 'Audit Trail',
      description: 'View complete audit history for all migration reviews and actions.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Super Admin Dashboard
  SUPER_ADMIN_DASHBOARD: [
    {
      id: 'super_1',
      target: '.super-admin-management-section',
      title: 'Platform Management',
      description: 'Full control over users, verifications, properties, pricing, and registration access.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'super_2',
      target: '.super-admin-system-section',
      title: 'Data & System',
      description: 'Access analytics, reports, logs, recruitment, admin management, and pending approvals.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_3',
      target: '.super-admin-platform-section',
      title: 'Quick Navigation',
      description: 'Jump to any admin section instantly using these categorized shortcut buttons.',
      placement: 'bottom',
      highlight: true,
    },
    {
      id: 'super_4',
      target: '.super-admin-marketing-section',
      title: 'Marketing & Content',
      description: 'Manage broadcasts, ad spaces, email marketing, SMS campaigns, and service ratings.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_5',
      target: '.super-admin-trust-section',
      title: 'Legal & Trust',
      description: 'Handle flags, fraud reports, lawyer invites, and manage legal professionals.',
      placement: 'left',
      highlight: true,
    },
  ],
};

const getTranslatedValue = (t, key, fallback) => (
  typeof t === 'function' ? t(key, { defaultValue: fallback }) : fallback
);

export const localizeTourSteps = (steps = [], t) => {
  const localeCode = getTranslatedValue(t, 'tour.locale_code', 'en');
  return steps.map((step) => {
    const titleKey = `tour.titles.${step.id}`;
    const localizedTitle = getTranslatedValue(t, titleKey, step.title);
    const useOriginalCopy = localeCode === 'en' || typeof t !== 'function';
    return {
      ...step,
      titleKey,
      title: localizedTitle,
      description: useOriginalCopy
        ? step.description
        : getTranslatedValue(
          t,
          'tour.ui.generic_step_description',
          step.description,
        ).replace('__TITLE__', localizedTitle),
      actionHint: step.actionHint
        ? useOriginalCopy
          ? step.actionHint
          : getTranslatedValue(
            t,
            'tour.ui.generic_action_hint',
            step.actionHint,
          )
        : undefined,
    };
  });
};

export const isTourStepEligible = (step, context = {}) => {
  if (!step) return false;
  if (typeof step.when === 'function') {
    try {
      return Boolean(step.when(context));
    } catch {
      return false;
    }
  }
  if (Array.isArray(step.roles) && !step.roles.includes(context.user?.user_type)) {
    return false;
  }
  if (step.requiresUserField && !context.user?.[step.requiresUserField]) {
    return false;
  }
  return true;
};

export const getEligibleTourSteps = (steps = [], context = {}) => (
  steps.filter((step) => isTourStepEligible(step, context))
);

// Map user roles to their appropriate tour steps
export const getTourStepsByUserRole = (userRole, t, context = {}) => {
  const roleToTourMap = {
    user: TOUR_STEPS.TENANT_DASHBOARD,
    landlord: TOUR_STEPS.LANDLORD_DASHBOARD,
    tenant: TOUR_STEPS.TENANT_DASHBOARD,
    agent: TOUR_STEPS.AGENT_DASHBOARD,
    lawyer: TOUR_STEPS.LAWYER_DASHBOARD,
    state_lawyer: TOUR_STEPS.LAWYER_DASHBOARD,
    super_lawyer: TOUR_STEPS.LAWYER_DASHBOARD,
    admin: TOUR_STEPS.ADMIN_DASHBOARD,
    lga_admin: TOUR_STEPS.ADMIN_DASHBOARD,
    financial_admin: TOUR_STEPS.FINANCIAL_ADMIN_DASHBOARD,
    lga_financial_admin: TOUR_STEPS.LGA_FINANCIAL_ADMIN_DASHBOARD,
    super_financial_admin: TOUR_STEPS.SUPER_FINANCIAL_ADMIN_DASHBOARD,
    transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    lga_transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    state_transportation_admin: TOUR_STEPS.STATE_TRANSPORTATION_ADMIN_DASHBOARD,
    super_transportation_admin: TOUR_STEPS.SUPER_TRANSPORTATION_ADMIN_DASHBOARD,
    fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    lga_fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    state_fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    super_fumigation_admin: TOUR_STEPS.SUPER_FUMIGATION_ADMIN_DASHBOARD,
    recruitment_admin: TOUR_STEPS.RECRUITMENT_ADMIN_DASHBOARD,
    state_admin: TOUR_STEPS.STATE_ADMIN_DASHBOARD,
    state_financial_admin: TOUR_STEPS.STATE_ADMIN_DASHBOARD,
    lga_support_admin: TOUR_STEPS.LGA_SUPPORT_DASHBOARD,
    state_support_admin: TOUR_STEPS.STATE_SUPPORT_DASHBOARD,
    super_support_admin: TOUR_STEPS.SUPER_SUPPORT_DASHBOARD,
    super_admin: TOUR_STEPS.SUPER_ADMIN_DASHBOARD,
  };

  return localizeTourSteps(
    getEligibleTourSteps(
      roleToTourMap[userRole] || TOUR_STEPS.TENANT_DASHBOARD,
      { ...context, role: userRole },
    ),
    t,
  );
};

// Helper function to get tour dashboard type from role
export const getTourDashboardType = (userRole) => {
  const roleToDashboardMap = {
    user: 'tenant_dashboard',
    landlord: 'landlord_dashboard',
    tenant: 'tenant_dashboard',
    agent: 'agent_dashboard',
    lawyer: 'lawyer_dashboard',
    state_lawyer: 'state_lawyer_dashboard',
    super_lawyer: 'super_lawyer_dashboard',
    admin: 'admin_dashboard',
    lga_admin: 'lga_admin_dashboard',
    state_admin: 'state_admin_dashboard',
    state_financial_admin: 'state_financial_admin_dashboard',
    financial_admin: 'financial_admin_dashboard',
    lga_financial_admin: 'lga_financial_admin_dashboard',
    super_financial_admin: 'super_financial_admin_dashboard',
    lga_support_admin: 'lga_support_admin_dashboard',
    state_support_admin: 'state_support_admin_dashboard',
    super_support_admin: 'super_support_admin_dashboard',
    transportation_admin: 'transportation_admin_dashboard',
    lga_transportation_admin: 'lga_transportation_admin_dashboard',
    state_transportation_admin: 'state_transportation_admin_dashboard',
    super_transportation_admin: 'super_transportation_admin_dashboard',
    fumigation_admin: 'fumigation_admin_dashboard',
    lga_fumigation_admin: 'lga_fumigation_admin_dashboard',
    state_fumigation_admin: 'state_fumigation_admin_dashboard',
    super_fumigation_admin: 'super_fumigation_admin_dashboard',
    recruitment_admin: 'recruitment_admin_dashboard',
    super_admin: 'super_admin_dashboard',
  };

  return roleToDashboardMap[userRole] || 'tenant_dashboard';
};

// Keep automatic starts and replays on the same route used by each role after
// login. Individual steps can override this with `route` when their control is
// rendered inside a particular dashboard tab.
export const getTourDashboardRoute = (userRole) => {
  const roleToRouteMap = {
    user: '/tenant/dashboard',
    tenant: '/tenant/dashboard',
    landlord: '/dashboard',
    agent: '/agent/dashboard',
    lawyer: '/lawyer',
    state_lawyer: '/lawyer/state',
    super_lawyer: '/lawyer/super',
    admin: '/admin',
    lga_admin: '/admin',
    state_admin: '/admin',
    state_financial_admin: '/admin',
    financial_admin: '/admin/financial-dashboard',
    lga_financial_admin: '/admin/financial-dashboard',
    super_financial_admin: '/admin/super-financial-dashboard',
    transportation_admin: '/admin/transportation',
    lga_transportation_admin: '/admin/transportation',
    state_transportation_admin: '/admin/transportation/state',
    super_transportation_admin: '/super-admin/transportation',
    fumigation_admin: '/admin/fumigation-cleaning',
    lga_fumigation_admin: '/admin/fumigation-cleaning',
    state_fumigation_admin: '/admin/fumigation-cleaning/state',
    super_fumigation_admin: '/super-admin/fumigation-cleaning',
    recruitment_admin: '/admin/recruitment',
    lga_support_admin: '/admin/lga-support-dashboard',
    state_support_admin: '/admin/state-support-dashboard',
    super_support_admin: '/admin/super-support-dashboard',
    super_admin: '/super-admin',
  };

  return roleToRouteMap[userRole] || '/tenant/dashboard';
};
