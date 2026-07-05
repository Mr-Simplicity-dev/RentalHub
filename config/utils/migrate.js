const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const db = require('../middleware/database'); // <-- correct relative path

const runMigrations = async () => {
  try {
    const migrationsPath = path.join(__dirname, '../../migrations');

    if (!fs.existsSync(migrationsPath)) {
      logger.info('No migrations folder found.');
      process.exit(0);
    }

    const files = fs.readdirSync(migrationsPath)
      .filter((file) => file.endsWith('.sql') && fs.statSync(path.join(migrationsPath, file)).isFile())
      .sort();

    for (const file of files) {
      const migrationName = file;

      const existing = await db.query(
        'SELECT id FROM migrations WHERE name = $1',
        [migrationName]
      );

      if (existing.rows.length > 0) {
        continue;
      }

      const sql = fs.readFileSync(
        path.join(migrationsPath, file),
        'utf8'
      );

      await db.query(sql);

      await db.query(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migrationName]
      );

      logger.info(`Migration executed: ${migrationName}`);
    }

    logger.info('All migrations completed');
    process.exit(0);

  } catch (error) {
    logger.error('Migration error:', error);
    process.exit(1);
  }
};

runMigrations();
