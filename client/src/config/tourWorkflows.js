import { localizeTourSteps } from './tourConfig';

// These tours cover real multi-page workflows. Interactive steps are limited to
// safe gestures such as changing a filter or opening a form; no tour step ever
// submits a payment, application, listing, withdrawal, or support request.
export const WORKFLOW_TOURS = {
  TENANT_RENTAL: {
    key: 'tenant_rental_workflow',
    id: 'tenant_rental',
    title: 'Complete your rental journey',
    description: 'Learn how to browse, save, apply, message, review payments, and get help.',
    steps: [
      {
        id: 'tenant_workflow_browse',
        target: '[data-tour-id="property-search-workflow"]',
        route: '/properties',
        title: 'Find the right property',
        description: 'Use the location and property filters to narrow the listings to homes that match your needs.',
        placement: 'bottom',
        advanceOn: 'change',
        actionHint: 'Change any filter to continue automatically.',
      },
      {
        id: 'tenant_workflow_save',
        target: '[data-tour-id="saved-properties-workflow"]',
        route: '/saved-properties',
        title: 'Compare saved properties',
        description: 'Your saved homes stay together here so you can compare them before applying.',
        placement: 'bottom',
      },
      {
        id: 'tenant_workflow_apply',
        target: '[data-tour-id="applications-workflow"]',
        route: '/applications',
        title: 'Track applications and negotiations',
        description: 'Follow each application, rent offer, counteroffer, approval, and next action from this workspace.',
        placement: 'bottom',
      },
      {
        id: 'tenant_workflow_messages',
        target: '[data-tour-id="messages-conversations-workflow"]',
        route: '/messages',
        title: 'Keep conversations in one place',
        description: 'Select a conversation to review messages with landlords and the RentalHub team.',
        placement: 'right',
        advanceOn: 'click',
        actionHint: 'Open a conversation to continue automatically.',
        optional: true,
      },
      {
        id: 'tenant_workflow_payments',
        target: '[data-tour-id="payment-history-workflow"]',
        route: '/payment-history',
        title: 'Confirm payment status',
        description: 'Review references, amounts, methods, and processing status before taking another payment action.',
        placement: 'bottom',
      },
      {
        id: 'tenant_workflow_support',
        target: '[data-tour-id="support-new-ticket-workflow"]',
        route: '/support',
        title: 'Ask for help safely',
        description: 'Open a support request, choose the correct category and priority, and track every response here.',
        placement: 'left',
        advanceOn: 'click',
        actionHint: 'Open the support form to finish this tour.',
      },
    ],
  },
  LANDLORD_LISTING: {
    key: 'landlord_listing_workflow',
    id: 'landlord_listing',
    title: 'Manage a property from listing to payment',
    description: 'Walk through listings, publishing, applications, messages, payments, and support.',
    steps: [
      {
        id: 'landlord_workflow_properties',
        target: '[data-tour-id="my-properties-workflow"]',
        route: '/my-properties',
        title: 'Manage your property portfolio',
        description: 'Review every property, its availability, and the actions that are ready for you.',
        placement: 'bottom',
      },
      {
        id: 'landlord_workflow_add',
        target: '[data-tour-id="add-property-form-workflow"]',
        route: '/add-property',
        title: 'Prepare a complete listing',
        description: 'Enter accurate property details before moving to verification and publication.',
        placement: 'bottom',
        advanceOn: 'change',
        actionHint: 'Change a listing field to continue automatically.',
      },
      {
        id: 'landlord_workflow_applications',
        target: '[data-tour-id="applications-workflow"]',
        route: '/applications',
        title: 'Review applicants and negotiate rent',
        description: 'Open an application to review the tenant, negotiate terms, and record the final decision.',
        placement: 'bottom',
      },
      {
        id: 'landlord_workflow_messages',
        target: '[data-tour-id="messages-compose-workflow"]',
        route: '/messages',
        title: 'Message the right participant',
        description: 'Choose an allowed recipient, add a clear subject, and keep the conversation on-platform.',
        placement: 'left',
      },
      {
        id: 'landlord_workflow_payments',
        target: '[data-tour-id="payment-history-workflow"]',
        route: '/payment-history',
        title: 'Audit incoming payment activity',
        description: 'Use references and payment status to verify activity before resolving a tenant issue.',
        placement: 'bottom',
      },
      {
        id: 'landlord_workflow_support',
        target: '[data-tour-id="support-new-ticket-workflow"]',
        route: '/support',
        title: 'Escalate an issue with context',
        description: 'Open the ticket form and link your request to the correct service area.',
        placement: 'left',
        advanceOn: 'click',
        actionHint: 'Open the support form to finish this tour.',
      },
    ],
  },
  AGENT_OPERATIONS: {
    key: 'agent_operations_workflow',
    id: 'agent_operations',
    title: 'Run your agent operations',
    description: 'Review earnings, withdrawals, properties, messages, and support in one guided flow.',
    steps: [
      {
        id: 'agent_workflow_earnings',
        target: '[data-tour-id="agent-earnings-workflow"]',
        route: '/agent/earnings',
        title: 'Understand your earnings',
        description: 'Review earned, pending, and available commission before starting a withdrawal.',
        placement: 'bottom',
      },
      {
        id: 'agent_workflow_withdrawals',
        target: '[data-tour-id="agent-withdrawals-workflow"]',
        route: '/agent/withdrawals',
        title: 'Track secure withdrawals',
        description: 'Check your verified destination, available amount, and the status of every request.',
        placement: 'bottom',
      },
      {
        id: 'agent_workflow_properties',
        target: '[data-tour-id="my-properties-workflow"]',
        route: '/my-properties',
        title: 'Manage assigned properties',
        description: 'Keep listing information current and open the available management actions from here.',
        placement: 'bottom',
      },
      {
        id: 'agent_workflow_messages',
        target: '[data-tour-id="messages-compose-workflow"]',
        route: '/messages',
        title: 'Coordinate through messages',
        description: 'Contact allowed participants and keep the operational record inside RentalHub.',
        placement: 'left',
      },
      {
        id: 'agent_workflow_support',
        target: '[data-tour-id="support-new-ticket-workflow"]',
        route: '/support',
        title: 'Escalate operational blockers',
        description: 'Open a categorized ticket so the correct support team receives the issue.',
        placement: 'left',
        advanceOn: 'click',
        actionHint: 'Open the support form to finish this tour.',
      },
    ],
  },
  LAWYER_CASEWORK: {
    key: 'lawyer_casework_workflow',
    id: 'lawyer_casework',
    title: 'Handle legal casework end to end',
    description: 'Move through assigned cases, evidence checks, dispute tracking, messages, and support.',
    steps: [
      {
        id: 'lawyer_workflow_cases',
        target: '.lawyer-cases-section',
        route: '/lawyer',
        title: 'Prioritize active cases',
        description: 'Start with the case queue, current status, and the work that needs your attention.',
        placement: 'right',
      },
      {
        id: 'lawyer_workflow_evidence',
        target: '[data-tour-id="verify-case-workflow"]',
        route: '/verify-case',
        title: 'Verify evidence integrity',
        description: 'Use the verification reference to inspect the integrity trail before relying on submitted evidence.',
        placement: 'bottom',
      },
      {
        id: 'lawyer_workflow_disputes',
        target: '[data-tour-id="my-disputes-workflow"]',
        route: '/my-disputes',
        title: 'Find and follow disputes',
        description: 'Search case records and review status changes without losing the dispute history.',
        placement: 'bottom',
      },
      {
        id: 'lawyer_workflow_messages',
        target: '[data-tour-id="messages-compose-workflow"]',
        route: '/messages',
        title: 'Keep legal communication recorded',
        description: 'Use on-platform messages for permitted case communication and escalation.',
        placement: 'left',
      },
      {
        id: 'lawyer_workflow_support',
        target: '[data-tour-id="support-new-ticket-workflow"]',
        route: '/support',
        title: 'Request operational support',
        description: 'Open a legal or technical ticket with enough context for the correct team to respond.',
        placement: 'left',
        advanceOn: 'click',
        actionHint: 'Open the support form to finish this tour.',
      },
    ],
  },
};

const translate = (t, key, fallback) => (
  typeof t === 'function' ? t(key, { defaultValue: fallback }) : fallback
);

export const getWorkflowToursByUserRole = (userRole, t) => {
  const roleToWorkflows = {
    user: [WORKFLOW_TOURS.TENANT_RENTAL],
    tenant: [WORKFLOW_TOURS.TENANT_RENTAL],
    landlord: [WORKFLOW_TOURS.LANDLORD_LISTING],
    agent: [WORKFLOW_TOURS.AGENT_OPERATIONS],
    lawyer: [WORKFLOW_TOURS.LAWYER_CASEWORK],
    state_lawyer: [WORKFLOW_TOURS.LAWYER_CASEWORK],
    super_lawyer: [WORKFLOW_TOURS.LAWYER_CASEWORK],
  };

  return (roleToWorkflows[userRole] || []).map((workflow) => ({
    ...workflow,
    title: translate(t, `tour.workflows.${workflow.id}.title`, workflow.title),
    description: translate(t, `tour.workflows.${workflow.id}.description`, workflow.description),
    steps: localizeTourSteps(workflow.steps, t),
  }));
};

