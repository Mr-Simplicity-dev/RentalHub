/**
 * Tenancy jurisdiction configuration.
 *
 * Nigeria is not one uniform tenancy-law jurisdiction. This layer lets
 * approved legal counsel configure jurisdiction-specific values (notice
 * periods, deposit rules, statutory references and extra clauses) WITHOUT
 * changing application code.
 *
 * These values are CONFIGURATION, not legal advice, and must be reviewed and
 * approved by RentalHub's legal administrators before they are relied upon.
 * The engine must never hard-code a single notice period or deposit rule for
 * every state.
 */

const DEFAULT_JURISDICTION = {
  code: 'NG-DEFAULT',
  state: null,
  name: 'Federal Republic of Nigeria (default)',
  noticePeriodDays: 30,
  depositCapMonths: 12,
  tenancyLawReference: 'Applicable State tenancy legislation',
  approved: false,
  clauses: [
    'The tenant shall keep the premises in good and tenantable condition (fair wear and tear excepted).',
    'The tenant shall not assign or sublet the premises without the landlord\'s written consent.',
    'The landlord shall give the notice required by the applicable State tenancy law before terminating the tenancy.',
  ],
};

// Values below are initial configuration placeholders. Legal administrators
// must review and mark a jurisdiction as approved before production reliance.
const STATE_JURISDICTIONS = {
  lagos: {
    code: 'NG-LA',
    state: 'Lagos',
    name: 'Lagos State',
    noticePeriodDays: 30,
    depositCapMonths: 12,
    tenancyLawReference: 'Lagos State Tenancy Law 2011',
    approved: false,
    clauses: [
      'The tenancy is subject to the Lagos State Tenancy Law 2011 and any subsidiary regulations.',
      'The landlord shall serve the statutory notice of the intention to recover possession.',
    ],
  },
  fct: {
    code: 'NG-FC',
    state: 'FCT',
    name: 'Federal Capital Territory',
    noticePeriodDays: 30,
    depositCapMonths: 12,
    tenancyLawReference: 'FCT Area Courts / Recovery of Premises Act (as applicable in the FCT)',
    approved: false,
    clauses: [
      'The tenancy is subject to the law applicable to the Federal Capital Territory.',
    ],
  },
  rivers: {
    code: 'NG-RI',
    state: 'Rivers',
    name: 'Rivers State',
    noticePeriodDays: 30,
    depositCapMonths: 12,
    tenancyLawReference: 'Rivers State tenancy legislation',
    approved: false,
    clauses: [],
  },
  kano: {
    code: 'NG-KN',
    state: 'Kano',
    name: 'Kano State',
    noticePeriodDays: 30,
    depositCapMonths: 12,
    tenancyLawReference: 'Kano State tenancy legislation',
    approved: false,
    clauses: [],
  },
};

const normalizeStateKey = (state) => String(state || '').trim().toLowerCase();

const resolveJurisdiction = ({ state, lga = null, tenancyType = 'residential' } = {}) => {
  const key = normalizeStateKey(state);
  const match = STATE_JURISDICTIONS[key] || null;

  const base = match || DEFAULT_JURISDICTION;
  return {
    code: base.code,
    state: base.state || (state || null),
    lga: lga || null,
    name: base.name,
    tenancyType,
    noticePeriodDays: base.noticePeriodDays,
    depositCapMonths: base.depositCapMonths,
    tenancyLawReference: base.tenancyLawReference,
    approved: Boolean(base.approved),
    clauses: [...(base.clauses || [])],
  };
};

const listJurisdictions = () =>
  Object.values(STATE_JURISDICTIONS).map((entry) => ({ ...entry, clauses: [...entry.clauses] }));

exports.DEFAULT_JURISDICTION = DEFAULT_JURISDICTION;
exports.STATE_JURISDICTIONS = STATE_JURISDICTIONS;
exports.resolveJurisdiction = resolveJurisdiction;
exports.listJurisdictions = listJurisdictions;
