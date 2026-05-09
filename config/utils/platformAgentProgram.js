const db = require('../middleware/database');

let platformAgentSchemaReady = false;

const ensurePlatformAgentSchema = async () => {
  if (platformAgentSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS platform_agents (
      id SERIAL PRIMARY KEY,
      source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
      agent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      nationality VARCHAR(80),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_platform_agent_source
          CHECK (source_type IN ('manual', 'registration'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_agents_user_unique
      ON platform_agents(agent_user_id)
      WHERE agent_user_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_platform_agents_active
      ON platform_agents(is_active, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_platform_agents_email
      ON platform_agents(email);
  `);

  platformAgentSchemaReady = true;
};

const fetchPublicPlatformAgents = async () => {
  await ensurePlatformAgentSchema();

  const result = await db.query(
    `SELECT
       pa.id,
       pa.source_type,
       pa.agent_user_id,
       COALESCE(NULLIF(u.full_name, ''), pa.full_name) AS full_name,
       COALESCE(NULLIF(u.email, ''), pa.email) AS email,
       COALESCE(NULLIF(u.phone, ''), pa.phone) AS phone,
       COALESCE(NULLIF(u.nationality, ''), pa.nationality, 'Nigeria') AS nationality,
       pa.is_active,
       pa.created_at
     FROM platform_agents pa
     LEFT JOIN users u ON u.id = pa.agent_user_id
     WHERE pa.is_active = TRUE
     ORDER BY COALESCE(NULLIF(u.full_name, ''), pa.full_name) ASC`
  );

  return result.rows;
};

module.exports = {
  ensurePlatformAgentSchema,
  fetchPublicPlatformAgents,
};
