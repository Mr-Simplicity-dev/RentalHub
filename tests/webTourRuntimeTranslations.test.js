const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const collectLiteralKeys = (source, namespace) => {
  const expression = new RegExp(`['"]${namespace}\\.([a-z0-9_]+)['"]`, 'g');
  const keys = new Set();
  let match;
  while ((match = expression.exec(source)) !== null) keys.add(match[1]);
  return [...keys];
};

const countObjectKey = (source, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (source.match(new RegExp(`(?:^|[,{\\s])${escaped}\\s*:`, 'gm')) || []).length;
};

test('runtime tour resources localize every literal web tour key in all eight languages', () => {
  const translations = [
    'tourTranslations.js',
    'tourTranslations.ha.js',
    'tourTranslations.yo.js',
    'tourTranslations.ig.js',
  ].map((file) => read('client', 'src', 'i18n', file)).join('\n');
  const sourcesByNamespace = {
    'tour.ui': read('client', 'src', 'components', 'tour', 'TourOverlay.jsx'),
    'tour.welcome': read('client', 'src', 'components', 'tour', 'WelcomeModal.jsx'),
    'tour.profile': read('client', 'src', 'pages', 'Profile.jsx'),
    'tour.analytics': read('client', 'src', 'pages', 'admin', 'TourAnalytics.jsx'),
  };

  Object.entries(sourcesByNamespace).forEach(([namespace, source]) => {
    collectLiteralKeys(source, namespace).forEach((key) => {
      assert.ok(
        countObjectKey(translations, key) >= 8,
        `${namespace}.${key} must have an explicit runtime value for en/fr/ar/ru/zh/ha/yo/ig`,
      );
    });
  });
});

