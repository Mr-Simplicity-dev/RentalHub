const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(ROOT, 'server.js');
const MOBILE_ROOT = path.join(ROOT, 'RentalHubMobile');
const MOBILE_SRC = path.join(ROOT, 'RentalHubMobile', 'src');
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const CHECK_ALL = process.argv.includes('--all');

const read = (file) => fs.readFileSync(file, 'utf8');

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return walk(target);
  return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [target] : [];
});

const normalizePath = (value) => {
  const withoutQuery = String(value || '').split('?')[0];
  const withParams = withoutQuery.replace(/\$\{[^}]+\}/g, ':param');
  const withSlash = withParams.startsWith('/') ? withParams : `/${withParams}`;
  return withSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
};

const routeMatches = (requestPath, routePath) => {
  const requestParts = normalizePath(requestPath).split('/').filter(Boolean);
  const routeParts = normalizePath(routePath).split('/').filter(Boolean);
  if (requestParts.length !== routeParts.length) return false;

  return routeParts.every((part, index) =>
    part.startsWith(':') || requestParts[index].startsWith(':') || part === requestParts[index]
  );
};

const getLineNumber = (content, index) => content.slice(0, index).split('\n').length;

const resolveModule = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

const collectReachableFiles = () => {
  const pending = [path.join(MOBILE_ROOT, 'index.js')];
  const reachable = new Set();
  const importPattern = /(?:import[\s\S]*?from\s*|require\()\s*['"]([^'"]+)['"]/g;

  while (pending.length) {
    const file = pending.pop();
    if (!file || reachable.has(file) || !fs.existsSync(file)) continue;
    reachable.add(file);

    const content = read(file);
    let importMatch;
    while ((importMatch = importPattern.exec(content))) {
      const resolved = resolveModule(file, importMatch[1]);
      if (resolved && !reachable.has(resolved)) pending.push(resolved);
    }
  }

  return reachable;
};

const serverContent = read(SERVER_FILE);
const routeImports = new Map();
const importPattern = /const\s+(\w+)\s*=\s*require\(['"]\.\/routes\/([^'"]+)['"]\)/g;
let match;
while ((match = importPattern.exec(serverContent))) {
  routeImports.set(match[1], path.join(ROOT, 'routes', `${match[2].replace(/\.js$/, '')}.js`));
}

const mounts = [];
const mountPattern = /app\.use\(\s*['"]\/api([^'"]*)['"]\s*,([\s\S]*?)\);/g;
while ((match = mountPattern.exec(serverContent))) {
  const mountBody = match[2];
  const routeVariable = [...routeImports.keys()].find((name) =>
    new RegExp(`\\b${name}\\b`).test(mountBody)
  );
  if (routeVariable) {
    mounts.push({
      basePath: normalizePath(match[1]),
      file: routeImports.get(routeVariable),
    });
  }
}

const backendRoutes = [];
const routePattern = /router\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
for (const mount of mounts) {
  if (!fs.existsSync(mount.file)) continue;
  const content = read(mount.file);
  while ((match = routePattern.exec(content))) {
    const method = match[1].toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;
    backendRoutes.push({
      method,
      path: normalizePath(`${mount.basePath}/${match[3]}`),
      file: path.relative(ROOT, mount.file),
      line: getLineNumber(content, match.index),
    });
  }
}

const mobileCalls = [];
const callPattern = /\bapi\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
const reachableFiles = CHECK_ALL ? null : collectReachableFiles();
const mobileFiles = walk(MOBILE_SRC).filter((file) => CHECK_ALL || reachableFiles.has(file));
for (const file of mobileFiles) {
  const content = read(file);
  while ((match = callPattern.exec(content))) {
    mobileCalls.push({
      method: match[1].toLowerCase(),
      path: normalizePath(match[3]),
      file: path.relative(ROOT, file),
      line: getLineNumber(content, match.index),
    });
  }
}

const unmatched = mobileCalls.filter((call) =>
  !backendRoutes.some((route) =>
    route.method === call.method && routeMatches(call.path, route.path)
  )
);

console.log(`Backend routes: ${backendRoutes.length}`);
console.log(`Mobile files checked: ${mobileFiles.length}${CHECK_ALL ? ' (all)' : ' (reachable)'}`);
console.log(`Mobile API calls: ${mobileCalls.length}`);
console.log(`Unmatched calls: ${unmatched.length}`);

for (const call of unmatched) {
  console.log(`${call.method.toUpperCase()} ${call.path} (${call.file}:${call.line})`);
}

process.exitCode = unmatched.length ? 1 : 0;
