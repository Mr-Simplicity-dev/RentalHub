const db = require('../config/middleware/database');

const run = async () => {
  const [roles, constraints, invalidScopes] = await Promise.all([
    db.query(`SELECT user_type, COUNT(*)::int AS count FROM users
      WHERE user_type IN ('admin','lga_admin','state_admin','zonal_admin','super_admin')
      GROUP BY user_type ORDER BY user_type`),
    db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%user_type%'`),
    db.query(`SELECT id, user_type, assigned_state, assigned_city, assigned_zone FROM users
      WHERE (user_type IN ('admin','lga_admin') AND (assigned_state IS NULL OR assigned_city IS NULL))
         OR (user_type = 'state_admin' AND assigned_state IS NULL)
         OR (user_type = 'zonal_admin' AND assigned_zone IS NULL)
      ORDER BY id`),
  ]);
  console.log(JSON.stringify({ roles: roles.rows, constraints: constraints.rows, invalidScopes: invalidScopes.rows }, null, 2));
};

run().then(() => db.end?.()).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
