const crypto = require('crypto');

const hashText = (content) =>
  crypto.createHash('sha256').update(content, 'utf8').digest('hex');

const normalizeMigrationContent = (content) =>
  String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

const computeCanonicalMigrationHash = (content) =>
  hashText(normalizeMigrationContent(content));

const getCompatibleMigrationHashes = (content) => {
  const raw = String(content || '');
  const canonical = normalizeMigrationContent(raw);
  const crlf = canonical.replace(/\n/g, '\r\n');

  return new Set([
    hashText(raw),
    hashText(canonical),
    hashText(crlf),
    hashText(`\uFEFF${canonical}`),
    hashText(`\uFEFF${crlf}`),
  ]);
};

const isStoredMigrationHashCompatible = (storedHash, content) =>
  typeof storedHash === 'string' &&
  getCompatibleMigrationHashes(content).has(storedHash.toLowerCase());

const extractMigrationNumber = (filename) => {
  const match = String(filename || '').match(/^(\d+[a-z]?)/i);
  return match ? match[1] : String(filename || '');
};

const stripOuterMigrationTransaction = (content) => {
  const lines = String(content || '').split(/\r?\n/);
  const isIgnorable = (line) => /^\s*(?:--.*)?$/.test(line);

  let first = 0;
  while (first < lines.length && isIgnorable(lines[first])) first += 1;

  let last = lines.length - 1;
  while (last >= 0 && isIgnorable(lines[last])) last -= 1;

  const hasBegin = first <= last && /^\s*BEGIN\s*;\s*$/i.test(lines[first]);
  const hasCommit = first <= last && /^\s*COMMIT\s*;\s*$/i.test(lines[last]);

  if (hasBegin !== hasCommit) {
    throw new Error('Migration has an incomplete outer BEGIN/COMMIT wrapper');
  }
  if (!hasBegin) {
    return { content: String(content || ''), stripped: false };
  }

  lines.splice(last, 1);
  lines.splice(first, 1);
  return { content: lines.join('\n'), stripped: true };
};

const findDuplicateMigrationNumbers = (migrations) => {
  const grouped = new Map();

  migrations.forEach((migration) => {
    const number = String(migration.number || '');
    const filenames = grouped.get(number) || [];
    filenames.push(migration.filename);
    grouped.set(number, filenames);
  });

  return [...grouped.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([number, filenames]) => ({ number, filenames }));
};

const findMissingAppliedMigrationFiles = (applied, migrations) => {
  const repositoryFilenames = new Set(
    migrations.map((migration) => migration.filename)
  );
  return applied
    .map((migration) => migration.filename)
    .filter((filename) => !repositoryFilenames.has(filename));
};

module.exports = {
  computeCanonicalMigrationHash,
  extractMigrationNumber,
  findDuplicateMigrationNumbers,
  findMissingAppliedMigrationFiles,
  getCompatibleMigrationHashes,
  isStoredMigrationHashCompatible,
  normalizeMigrationContent,
  stripOuterMigrationTransaction,
};
