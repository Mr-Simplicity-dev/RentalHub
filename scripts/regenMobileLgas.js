const fs = require('fs');
const nigeriaLocations = require('../data/nigeriaLocations');

const file = 'RentalHubMobile/src/screens/shared/ContactWidgetScreen.js';
let content = fs.readFileSync(file, 'utf8');

const start = content.indexOf('const STATES_AND_LGAS = {');
const end = content.indexOf('\n};', start);
if (start === -1 || end === -1) {
  console.error('map block not found');
  process.exit(1);
}

const mobileKeyFor = (entry) => {
  const name = entry.state || entry.displayName || '';
  return name === 'Federal Capital Territory' ? 'FCT' : name;
};

let total = 0;
const lines = [];
lines.push('const STATES_AND_LGAS = {');
for (const entry of nigeriaLocations) {
  const key = mobileKeyFor(entry);
  const lgas = (entry.lgas || []).map((l) => `'${l.replace(/'/g, "\\'")}'`);
  total += lgas.length;
  lines.push(`  '${key}': [${lgas.join(', ')}],`);
}
lines.push('};');

const newBlock = lines.join('\n');
content = content.slice(0, start) + newBlock + content.slice(end);

fs.writeFileSync(file, content, 'utf8');
console.log('mobile map regenerated, total LGAs:', total);
