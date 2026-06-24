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
      title: 'Your Commissions',
      description: 'Track all commissions earned from completed bookings and transactions.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'agent_2',
      target: '.agent-bookings-section',
      title: 'Manage Bookings',
      description: 'View all bookings you\'ve facilitated. Track payments and client information.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'agent_3',
      target: '.agent-earnings-section',
      title: 'Earnings & Withdrawals',
      description: 'Track your total earnings and request withdrawals. View transaction history.',
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
      target: '.lawyer-evidence-section',
      title: 'Evidence Review',
      description: 'Review evidence submitted by clients. Verify authenticity and add notes.',
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
      title: 'Dispute Resolution',
      description: 'Review and manage disputes. Escalate cases to lawyers when necessary.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'admin_4',
      target: '.admin-payments-section',
      title: 'Payment Management',
      description: 'Monitor transactions, verify payments, and handle financial issues.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'admin_5',
      target: '.admin-reports-section',
      title: 'Reports & Analytics',
      description: 'View platform-wide analytics, user growth, and performance metrics.',
      placement: 'top',
      highlight: true,
    },
  ],

  // Financial Admin Dashboard
  FINANCIAL_ADMIN_DASHBOARD: [
    {
      id: 'fin_admin_1',
      target: '.fin-admin-payments-section',
      title: 'Transaction Management',
      description: 'Monitor all financial transactions on the platform.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'fin_admin_2',
      target: '.fin-admin-settlements-section',
      title: 'Settlement Reports',
      description: 'View and manage payment settlements and reconciliation.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fin_admin_3',
      target: '.fin-admin-refunds-section',
      title: 'Refund Management',
      description: 'Process and track all refund requests.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'fin_admin_4',
      target: '.fin-admin-reports-section',
      title: 'Financial Reports',
      description: 'Generate and view detailed financial reports.',
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

  // Recruitment Admin Dashboard
  RECRUITMENT_ADMIN_DASHBOARD: [
    {
      id: 'rec_admin_1',
      target: '.rec-admin-jobs-section',
      title: 'Job Postings',
      description: 'View and manage all job postings on the platform.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'rec_admin_2',
      target: '.rec-admin-applications-section',
      title: 'Applications',
      description: 'Review job applications and manage the hiring process.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'rec_admin_3',
      target: '.rec-admin-candidates-section',
      title: 'Candidate Management',
      description: 'View candidate profiles and application history.',
      placement: 'left',
      highlight: true,
    },
  ],

  // LGA Support Admin Dashboard
  LGA_SUPPORT_DASHBOARD: [
    {
      id: 'lga_support_1',
      target: '.lga-support-tickets-section',
      title: 'Support Tickets',
      description: 'View and manage all support tickets. Assign tickets to yourself and resolve user issues.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'lga_support_2',
      target: '.lga-support-property-requests-section',
      title: 'Property Requests',
      description: 'Review and approve property listing requests from landlords and agents in your LGA.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'lga_support_3',
      target: '.lga-support-tenancy-section',
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
      title: 'Dashboard Overview',
      description: 'View pending migration requests and quick stats for your state.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'state_support_2',
      target: '.state-support-migration-section',
      title: 'Migration Queue',
      description: 'Review outgoing and incoming state migration requests from agents and lawyers.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'state_support_3',
      target: '.state-support-property-requests-section',
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
      title: 'Operational Overview',
      description: 'View migration stats, ticket counts, system alerts, and commission health at a glance.',
      placement: 'right',
      highlight: true,
    },
    {
      id: 'super_support_2',
      target: '.super-support-migration-section',
      title: 'Migration Queue',
      description: 'Full migration queue with filters, approve/reject, and CSV export.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_support_3',
      target: '.super-support-tickets-section',
      title: 'Support Tickets',
      description: 'Manage all support tickets — resolve, escalate, or assign to team members.',
      placement: 'left',
      highlight: true,
    },
    {
      id: 'super_support_4',
      target: '.super-support-audit-section',
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

// Map user roles to their appropriate tour steps
export const getTourStepsByUserRole = (userRole) => {
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
    lga_financial_admin: TOUR_STEPS.FINANCIAL_ADMIN_DASHBOARD,
    super_financial_admin: TOUR_STEPS.FINANCIAL_ADMIN_DASHBOARD,
    transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    lga_transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    state_transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    super_transportation_admin: TOUR_STEPS.TRANSPORTATION_ADMIN_DASHBOARD,
    fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    lga_fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    state_fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    super_fumigation_admin: TOUR_STEPS.FUMIGATION_ADMIN_DASHBOARD,
    recruitment_admin: TOUR_STEPS.RECRUITMENT_ADMIN_DASHBOARD,
    state_admin: TOUR_STEPS.ADMIN_DASHBOARD,
    state_financial_admin: TOUR_STEPS.FINANCIAL_ADMIN_DASHBOARD,
    lga_support_admin: TOUR_STEPS.LGA_SUPPORT_DASHBOARD,
    state_support_admin: TOUR_STEPS.STATE_SUPPORT_DASHBOARD,
    super_support_admin: TOUR_STEPS.SUPER_SUPPORT_DASHBOARD,
    super_admin: TOUR_STEPS.SUPER_ADMIN_DASHBOARD,
  };

  return roleToTourMap[userRole] || TOUR_STEPS.TENANT_DASHBOARD;
};

// Helper function to get tour dashboard type from role
export const getTourDashboardType = (userRole) => {
  const roleToDashboardMap = {
    user: 'tenant_dashboard',
    landlord: 'landlord_dashboard',
    tenant: 'tenant_dashboard',
    agent: 'agent_dashboard',
    lawyer: 'lawyer_dashboard',
    state_lawyer: 'lawyer_dashboard',
    super_lawyer: 'lawyer_dashboard',
    admin: 'admin_dashboard',
    lga_admin: 'admin_dashboard',
    state_admin: 'admin_dashboard',
    state_financial_admin: 'financial_admin_dashboard',
    financial_admin: 'financial_admin_dashboard',
    lga_financial_admin: 'financial_admin_dashboard',
    super_financial_admin: 'financial_admin_dashboard',
    lga_support_admin: 'lga_support_dashboard',
    state_support_admin: 'state_support_dashboard',
    super_support_admin: 'super_support_dashboard',
    transportation_admin: 'transportation_admin_dashboard',
    lga_transportation_admin: 'transportation_admin_dashboard',
    state_transportation_admin: 'transportation_admin_dashboard',
    super_transportation_admin: 'transportation_admin_dashboard',
    fumigation_admin: 'fumigation_admin_dashboard',
    lga_fumigation_admin: 'fumigation_admin_dashboard',
    state_fumigation_admin: 'fumigation_admin_dashboard',
    super_fumigation_admin: 'fumigation_admin_dashboard',
    recruitment_admin: 'recruitment_admin_dashboard',
    super_admin: 'super_admin_dashboard',
  };

  return roleToDashboardMap[userRole] || 'tenant_dashboard';
};
