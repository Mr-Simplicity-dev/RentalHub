/**
 * Tenancy agreement template + legal review workflow.
 *
 * Templates are managed by approved legal administrators. Only APPROVED or
 * ACTIVE templates may be used for production execution; ordinary landlords
 * cannot edit core legal clauses.
 */

const db = require('../config/middleware/database');
const logger = require('../config/utils/logger');
const { logAction } = require('../config/utils/auditLogger');

const TEMPLATE_STATUS = {
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  RETIRED: 'RETIRED',
};

const PRODUCTION_STATUSES = [TEMPLATE_STATUS.APPROVED, TEMPLATE_STATUS.ACTIVE];
const APPROVER_ROLES = new Set(['super_admin', 'lawyer', 'state_lawyer', 'super_lawyer']);

let schemaEnsured = false;
const ensureTemplateSchema = async () => {
  if (schemaEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenancy_agreement_templates (
      id SERIAL PRIMARY KEY,
      jurisdiction_code VARCHAR(40) NOT NULL,
      jurisdiction_name VARCHAR(120) NOT NULL,
      state VARCHAR(80),
      name VARCHAR(200) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      body JSONB NOT NULL DEFAULT '{}'::jsonb,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMP,
      effective_date DATE,
      retired_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch((error) => {
    logger.warn('Tenancy template schema ensure failed', { error: error.message });
  });
  schemaEnsured = true;
};

const listTemplates = async ({ jurisdictionCode = null, status = null } = {}) => {
  await ensureTemplateSchema();
  const params = [];
  const clauses = [];
  if (jurisdictionCode) {
    params.push(jurisdictionCode);
    clauses.push(`jurisdiction_code = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `SELECT id, jurisdiction_code, jurisdiction_name, state, name, version, status,
            approved_by, approved_at, effective_date, created_by, created_at, updated_at
       FROM tenancy_agreement_templates
       ${where}
      ORDER BY jurisdiction_code ASC, version DESC`,
    params
  );
  return result.rows;
};

const createTemplate = async (user, payload) => {
  await ensureTemplateSchema();
  if (!payload.jurisdiction_code || !payload.name) {
    throw Object.assign(new Error('jurisdiction_code and name are required'), { status: 400 });
  }
  const versionResult = await db.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM tenancy_agreement_templates WHERE jurisdiction_code = $1',
    [payload.jurisdiction_code]
  );
  const version = versionResult.rows[0].next;

  const result = await db.query(
    `INSERT INTO tenancy_agreement_templates
       (jurisdiction_code, jurisdiction_name, state, name, version, status, body, created_by)
     VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6::jsonb, $7)
     RETURNING id, version, status`,
    [
      payload.jurisdiction_code,
      payload.jurisdiction_name || payload.jurisdiction_code,
      payload.state || null,
      payload.name,
      version,
      JSON.stringify(payload.body || {}),
      user.id,
    ]
  );
  await logAction({ actorId: user.id, action: 'Tenancy agreement template created', targetType: 'tenancy_agreement_template', targetId: result.rows[0].id });
  return result.rows[0];
};

const updateTemplateStatus = async (user, templateId, status) => {
  await ensureTemplateSchema();
  if (!Object.values(TEMPLATE_STATUS).includes(status)) {
    throw Object.assign(new Error('Invalid template status'), { status: 400 });
  }
  if (PRODUCTION_STATUSES.includes(status) && !APPROVER_ROLES.has(user.user_type)) {
    throw Object.assign(new Error('Only an approved legal administrator can approve a template'), { status: 403 });
  }

  const result = await db.query(
    `UPDATE tenancy_agreement_templates
        SET status = $1,
            approved_by = CASE WHEN $1 IN ('APPROVED', 'ACTIVE') THEN $2 ELSE approved_by END,
            approved_at = CASE WHEN $1 IN ('APPROVED', 'ACTIVE') THEN CURRENT_TIMESTAMP ELSE approved_at END,
            retired_at = CASE WHEN $1 = 'RETIRED' THEN CURRENT_TIMESTAMP ELSE retired_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, status, approved_by, approved_at`,
    [status, user.id, templateId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Template not found'), { status: 404 });
  }
  await logAction({ actorId: user.id, action: `Tenancy agreement template set ${status}`, targetType: 'tenancy_agreement_template', targetId: templateId });
  return result.rows[0];
};

const getActiveTemplate = async (jurisdictionCode) => {
  await ensureTemplateSchema();
  const result = await db.query(
    `SELECT id, jurisdiction_code, name, version, status, body
       FROM tenancy_agreement_templates
      WHERE jurisdiction_code = $1 AND status IN ('APPROVED', 'ACTIVE')
      ORDER BY version DESC
      LIMIT 1`,
    [jurisdictionCode]
  );
  return result.rows[0] || null;
};

exports.TEMPLATE_STATUS = TEMPLATE_STATUS;
exports.PRODUCTION_STATUSES = PRODUCTION_STATUSES;
exports.ensureTemplateSchema = ensureTemplateSchema;
exports.listTemplates = listTemplates;
exports.createTemplate = createTemplate;
exports.updateTemplateStatus = updateTemplateStatus;
exports.getActiveTemplate = getActiveTemplate;
