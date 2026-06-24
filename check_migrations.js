const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost', port: 5432, database: 'rental_platform',
  user: 'postgres', password: 'Onimisi2323$'
});
pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'migrations') AS exists")
  .then(r => {
    const exists = r.rows[0].exists;
    console.log('migrations table exists:', exists);
    if (!exists) {
      console.log('No migrations table - need to run migrations from scratch');
      process.exit(0);
    }
    return pool.query('SELECT id, name, created_at FROM migrations ORDER BY id DESC LIMIT 10')
      .then(r2 => {
        console.log('Last 10 migrations:');
        r2.rows.forEach(r => console.log(' ', r.id, r.name, r.created_at));
        process.exit(0);
      });
  })
  .catch(e => {
    console.log('Error:', e.message, e.stack?.substring(0, 200));
    process.exit(1);
  });
