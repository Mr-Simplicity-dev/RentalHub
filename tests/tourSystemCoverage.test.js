const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB_SOURCE = path.join(ROOT, 'client', 'src');
const MOBILE_ROOT = path.join(ROOT, 'RentalHubMobile');
const MOBILE_SOURCE = path.join(MOBILE_ROOT, 'src');

const walk = (directory, extensions) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.git', 'build', 'dist'].includes(entry.name)) return [];
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolutePath, extensions);
    return extensions.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
};

const read = (filename) => fs.readFileSync(filename, 'utf8');

const collectMatches = (source, expression) => {
  const values = [];
  let match;
  while ((match = expression.exec(source)) !== null) values.push(match[1]);
  return values;
};

const selectorToken = (selector) => {
  if (selector.startsWith('.') || selector.startsWith('#')) {
    return selector.slice(1).split(/[\s>:[.]/)[0];
  }
  return selector.match(/data-tour-id=["']([^"']+)["']/)?.[1] || selector;
};

const flattenObject = (value, prefix = '') => Object.entries(value || {}).flatMap(
  ([key, child]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenObject(child, pathKey)
      : [[pathKey, child]];
  },
);

test('every configured web tour step has a unique id and a real target', () => {
  const configPath = path.join(WEB_SOURCE, 'config', 'tourConfig.js');
  const config = read(configPath);
  const stepIds = collectMatches(config, /\bid:\s*['"]([^'"]+)['"]/g);
  const targets = collectMatches(config, /\btarget:\s*['"]([^'"]+)['"]/g);
  const sourceCorpus = walk(WEB_SOURCE, new Set(['.js', '.jsx']))
    .filter((filename) => filename !== configPath)
    .map(read)
    .join('\n');

  assert.ok(stepIds.length >= 20, 'the web tour must retain meaningful role coverage');
  assert.equal(new Set(stepIds).size, stepIds.length, 'web tour step IDs must be unique');
  assert.equal(targets.length, stepIds.length, 'every web step must declare one target');

  targets.forEach((selector) => {
    const token = selectorToken(selector);
    assert.ok(
      sourceCorpus.includes(token),
      `web tour selector ${selector} does not match a source-level target`,
    );
  });
});

test('every configured web tour route is represented by the application router', () => {
  const configPath = path.join(WEB_SOURCE, 'config', 'tourConfig.js');
  const config = read(configPath);
  const routes = collectMatches(config, /\broute:\s*['"]([^'"]+)['"]/g)
    .map((route) => route.split('?')[0].split('#')[0]);
  const corpus = walk(WEB_SOURCE, new Set(['.js', '.jsx']))
    .filter((filename) => filename !== configPath)
    .map(read)
    .join('\n');

  routes.forEach((route) => {
    assert.ok(corpus.includes(route), `web tour route ${route} is not represented in the app`);
  });
});

test('web workflow tours use real targets and registered routes', () => {
  const workflowPath = path.join(WEB_SOURCE, 'config', 'tourWorkflows.js');
  assert.ok(fs.existsSync(workflowPath), 'workflow tour catalog must exist');
  const workflows = read(workflowPath);
  const targets = collectMatches(workflows, /\btarget:\s*['"]([^'"]+)['"]/g);
  const routes = collectMatches(workflows, /\broute:\s*['"]([^'"]+)['"]/g)
    .map((route) => route.split('?')[0].split('#')[0]);
  const sourceCorpus = walk(WEB_SOURCE, new Set(['.js', '.jsx']))
    .filter((filename) => filename !== workflowPath)
    .map(read)
    .join('\n');

  assert.ok(targets.length >= 12, 'critical workflows need meaningful multi-screen coverage');
  targets.forEach((selector) => {
    assert.ok(
      sourceCorpus.includes(selectorToken(selector)),
      `workflow selector ${selector} does not match a source-level target`,
    );
  });
  routes.forEach((route) => {
    assert.ok(sourceCorpus.includes(route), `workflow route ${route} is not represented in the app`);
  });
});

test('web tour dictionaries have complete keys and real translations', () => {
  const languageCodes = ['en', 'fr', 'ar', 'ru', 'zh'];
  const dictionaries = Object.fromEntries(languageCodes.map((code) => [
    code,
    JSON.parse(read(path.join(WEB_SOURCE, 'i18n', `${code}.json`))),
  ]));
  const englishEntries = flattenObject(dictionaries.en.tour);
  const englishKeys = englishEntries.map(([key]) => key).sort();

  assert.ok(englishKeys.length >= 40, 'English tour dictionary must cover UI and step copy');
  for (const code of languageCodes) {
    const entries = flattenObject(dictionaries[code].tour);
    const keys = entries.map(([key]) => key).sort();
    assert.deepEqual(keys, englishKeys, `${code} tour dictionary must match the English key set`);
    entries.forEach(([key, value]) => {
      assert.equal(typeof value, 'string', `${code}:${key} must be a string`);
      assert.ok(value.trim(), `${code}:${key} must not be empty`);
    });
  }

  const englishValues = new Map(englishEntries);
  for (const code of languageCodes.filter((value) => value !== 'en')) {
    const localizedEntries = flattenObject(dictionaries[code].tour);
    const translatedCount = localizedEntries.filter(
      ([key, value]) => value !== englishValues.get(key),
    ).length;
    assert.ok(
      translatedCount / localizedEntries.length >= 0.6,
      `${code} must contain real translations instead of mostly English fallbacks`,
    );
  }
});

test('every configured native target is registered outside the mobile tour config', () => {
  const configPath = path.join(MOBILE_SOURCE, 'config', 'tourConfig.js');
  const config = read(configPath);
  const stepIds = collectMatches(config, /\bid:\s*['"]([^'"]+)['"]/g);
  const sourceCorpus = walk(MOBILE_SOURCE, new Set(['.js', '.jsx']))
    .filter((filename) => filename !== configPath)
    .map(read)
    .join('\n');

  assert.ok(stepIds.length >= 20, 'the native tour must retain meaningful role coverage');
  assert.equal(new Set(stepIds).size, stepIds.length, 'native tour step IDs must be unique');
  stepIds.forEach((targetId) => {
    assert.ok(
      sourceCorpus.includes(targetId),
      `native tour target ${targetId} is not registered by a screen`,
    );
  });
});

test('native tour destinations are registered in React Navigation', () => {
  const config = read(path.join(MOBILE_SOURCE, 'config', 'tourConfig.js'));
  const navigator = read(path.join(MOBILE_SOURCE, 'navigation', 'AppNavigator.js'));
  const destinationNames = collectMatches(config, /\bname:\s*['"]([^'"]+)['"]/g);

  destinationNames.forEach((name) => {
    assert.match(
      navigator,
      new RegExp(`(?:Stack|Tab)\\.Screen\\s+name=["']${name}["']`),
      `native tour destination ${name} is not registered`,
    );
  });
});

test('native platform configuration retains safe-area, launch, font and RTL readiness', () => {
  const appSource = read(path.join(MOBILE_SOURCE, 'App.js'));
  const infoPlist = read(path.join(MOBILE_ROOT, 'ios', 'RentalHubMobile', 'Info.plist'));
  const androidManifest = read(
    path.join(MOBILE_ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  );

  assert.match(appSource, /SafeAreaProvider/);
  assert.match(appSource, /TourProvider/);
  assert.match(infoPlist, /UILaunchStoryboardName/);
  assert.match(infoPlist, /UIAppFonts/);
  assert.match(androidManifest, /android:supportsRtl=["']true["']/);

  for (const font of [
    'Inter-Bold.ttf',
    'Inter-Medium.ttf',
    'Inter-Regular.ttf',
    'Inter-SemiBold.ttf',
  ]) {
    assert.match(infoPlist, new RegExp(font.replace('.', '\\.')));
    assert.ok(
      fs.existsSync(path.join(MOBILE_ROOT, 'assets', 'fonts', font)),
      `${font} must exist for iOS and Android packaging`,
    );
  }
});
