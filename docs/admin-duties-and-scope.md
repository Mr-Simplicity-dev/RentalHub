# Administrative Duties and Scope

**Status:** Target authority model for dashboard, backend authorization, web, Android, iOS, deep links, tours, and analytics

## Core Rule

Every administrator must operate only within the scope of the assigned role, department, jurisdiction, and dashboard. Client-side dashboard visibility is not a security boundary; backend authorization must enforce every rule.

## Authority Structure

```text
Central Super Admin
|
|-- Super Financial Admin
|-- Super Support Admin
|-- Super Transportation Admin
|-- Super Fumigation Admin
|
|-- Zonal Admin
|   |-- State Admin
|       |-- LGA Admin
|
|-- Legal Authority Chain
    |-- Super Lawyer
    |-- State Lawyer
    |-- Lawyer
```

## 1. Central Super Admin

**Canonical role:** `super_admin`  
**Scope:** Entire platform, all zones, states, LGAs, departments, users, and dashboards

### Duties

- Operate the central platform-control dashboard.
- View and manage platform-wide users, properties, applications, reports, flags, fraud signals, and compliance records.
- Manage platform configuration, pricing, registration rules, feature controls, and administrative policies.
- Manage administrator accounts, assignments, role changes, and deactivation.
- Review global audit logs and security events.
- Coordinate cross-department escalations.
- Review national financial, support, transportation, fumigation, legal, and operational summaries.
- Access lower-level dashboards only through an explicit, audited “view as” or delegated operational mode.
- Maintain platform-wide emergency and incident-response authority.

### Must not do accidentally

- Fall through to the ordinary LGA admin dashboard.
- Grant departmental super-admin powers without an audit record.
- Bypass jurisdiction or department boundaries without a recorded reason.
- Use impersonation without clear audit logging and session controls.

## 2. Super Financial Admin

**Canonical role:** `super_financial_admin`  
**Scope:** National, financial department only

### Duties

- Monitor all financial transactions and payment states.
- Review wallets, rent payments, refunds, withdrawals, commissions, and settlements.
- Manage frozen funds and financial investigations.
- Review and process administrator withdrawal requests.
- Monitor financial reconciliation and audit trails.
- Produce national financial reports and exports.
- Review finance-related support escalations.
- Monitor financial risk, failed payments, duplicate payment signals, and payout exceptions.

### Must not control by default

- User/platform configuration.
- Transportation operations.
- Fumigation operations.
- General support administration.
- Non-financial role assignment.

## 3. Super Support Admin

**Canonical role:** `super_support_admin`  
**Scope:** National, support department only

### Duties

- Manage the national support queue.
- Manage support administrator pools, assignments, and leadership.
- Review escalations across states and LGAs.
- Monitor support SLAs, response times, breaches, and resolution quality.
- Coordinate support tickets involving finance, transportation, fumigation, legal, tenancy, and technical issues.
- Operate approved voice-support and callback workflows.
- Review support audit trails and escalation decisions.
- Produce national support reports.

### Must not control by default

- Financial approval and payout authority.
- Transportation or fumigation configuration.
- Platform-wide user/role administration.
- Unrelated department data beyond what is needed to resolve a support case.

## 4. Super Transportation Admin

**Canonical role:** `super_transportation_admin`  
**Scope:** National, transportation department only

### Duties

- Manage all transportation bookings and operational states.
- Manage transportation providers, drivers, routes, coverage, and pricing.
- Review transportation revenue and payment activity.
- Resolve cancellations, failed assignments, and logistics exceptions.
- Monitor provider performance and service quality.
- Review transportation escalations and support issues.
- Produce national transportation reports and exports.
- Manage transportation-specific policies and operational controls.

### Must not control by default

- Fumigation or cleaning operations.
- General financial administration outside transportation revenue.
- Platform-wide user roles.
- Support administration outside transportation cases.

## 5. Super Fumigation Admin

**Canonical role:** `super_fumigation_admin`  
**Scope:** National, fumigation and cleaning department only

### Duties

- Manage all fumigation and cleaning bookings.
- Manage service providers, categories, pricing, coverage, and availability.
- Review provider compliance and safety records.
- Monitor booking, payment, treatment, cancellation, and completion states.
- Review service quality and provider performance.
- Manage fumigation-related escalations.
- Produce national fumigation and cleaning reports.
- Maintain department-specific operational policies.

### Must not control by default

- Transportation operations.
- General finance administration.
- Platform-wide user roles.
- Support administration outside fumigation and cleaning cases.

## 6. Zonal Admin

**Canonical role:** `zonal_admin`  
**Scope:** Assigned zone and its states only

### Duties

- Monitor state-admin performance within the assigned zone.
- Review zone-level operational metrics and reports.
- Coordinate issues spanning multiple states in the zone.
- Review state escalations and unresolved LGA issues.
- Monitor zone coverage, staffing, compliance, and service health.
- Escalate national matters to the central super admin or the relevant departmental super admin.
- Produce zone-level reports.

### Must not control

- States outside the assigned zone.
- National platform configuration.
- Departmental super-admin functions unless separately assigned and explicitly authorized.
- Other zones or central administrator accounts.

## 7. State Admin

**Canonical role:** `state_admin`  
**Scope:** One assigned state and its LGAs

### Duties

- Oversee LGAs within the assigned state.
- Review state users, properties, applications, inspections, and requests.
- Manage state-level approvals and escalations.
- Monitor state operational, tenancy, service, and compliance metrics.
- Review LGA-admin performance and unresolved local issues.
- Coordinate state migrations and state-level workflows.
- Produce reports for the assigned state.
- Escalate zone-level or national matters upward.

### Must not control

- Other states.
- Other zones.
- National platform configuration.
- Departmental super-admin powers.
- LGA records outside the assigned state.

## 8. LGA Admin

**Canonical role:** `lga_admin`  
**Legacy alias:** `admin`  
**Scope:** One assigned Local Government Area

### Duties

- Manage local platform activity within the assigned LGA.
- Review local users, landlords, tenants, agents, and properties.
- Review local applications, property requests, inspections, and verification queues.
- Handle permitted local tenancy workflows.
- Monitor local transportation, fumigation, support, and service activity where explicitly assigned.
- Review local reports and submit escalations to the state team.
- Maintain accurate local records and operational notes.
- Use the LGA dashboard and only the actions allowed by the assigned scope.

### Must not control

- Other LGAs.
- Other states or zones.
- National users or platform configuration.
- Departmental super-admin functions.
- Global financial, transportation, fumigation, or support controls.

### Legacy migration rule

The literal `admin` role should be treated as a compatibility alias for `lga_admin` while existing accounts are migrated. It must not remain a separate authority level. Backend middleware, web routing, mobile routing, tours, analytics, and reports must eventually use the canonical `lga_admin` policy.

## 9. Legal Authority Chain

These roles are separate from the four departmental super-admin departments.

### Super Lawyer

**Canonical role:** `super_lawyer`  
**Scope:** National legal operations

- Oversee legal casework and legal support quality.
- Review national legal queues and escalations.
- Manage legal assignments and legal-team operations.
- Review legal evidence, case integrity, and legal reporting.
- Coordinate legal issues across states.

### State Lawyer

**Canonical role:** `state_lawyer`  
**Scope:** Assigned state legal operations

- Manage legal cases within the assigned state.
- Review disputes, evidence, clients, and legal communications.
- Coordinate state legal escalations.
- Escalate national legal matters to `super_lawyer`.

### Lawyer

**Canonical role:** `lawyer`  
**Scope:** Assigned legal cases and clients

- Handle assigned disputes and legal cases.
- Review evidence and verification trails.
- Communicate with assigned clients and case participants.
- Maintain case records and legal notes.
- Escalate matters outside assigned authority.

## Dashboard Requirements

Each role must have:

- A clearly identified dashboard and role label.
- Navigation limited to the role’s scope.
- No accidental fallback to a lower or unrelated dashboard.
- Role-specific empty, loading, error, and permission-denied states.
- Deep links that resolve inside the correct role root.
- Buttons and actions checked against backend authorization.
- Tour steps matching the actual dashboard and role.
- Audit events for sensitive actions, impersonation, delegation, and cross-scope access.

## Required Cross-Platform Policy

The same role-to-scope-to-dashboard policy must drive:

- Backend middleware and route authorization.
- Web role guards and navigation.
- Android navigation roots and screen access.
- iOS navigation roots and screen access.
- Deep links and notification links.
- Dashboard tours and analytics.
- Admin matrix tests and security tests.

## Forbidden Role Collapse

The following must not happen accidentally:

- Central `super_admin` rendering the ordinary LGA dashboard.
- A departmental super admin receiving another department’s controls.
- A zonal admin receiving national authority.
- A state admin seeing another state.
- An LGA admin seeing another LGA.
- A legal role being treated as a general platform administrator.
- The legacy `admin` role receiving privileges different from canonical `lga_admin` without an explicit migration policy.
