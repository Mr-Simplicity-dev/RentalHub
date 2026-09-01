// Renders SEO page data (seoPageService) into a complete, crawler-friendly
// HTML document. Served to search-engine bots so /nigeria* pages become
// indexable even though the client app renders them client-side.
// Browsers keep getting the normal SPA/JSON responses.

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value) => {
  const n = Number(value || 0);
  if (!n) return null;
  return `₦${n.toLocaleString('en-NG')}`;
};

const isSearchCrawler = (userAgent = '') => {
  const ua = String(userAgent || '').toLowerCase();
  return (
    ua.includes('googlebot') ||
    ua.includes('bingbot') ||
    ua.includes('duckduckbot') ||
    ua.includes('slurp') ||
    ua.includes('baiduspider') ||
    ua.includes('yandex') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('linkedinbot') ||
    ua.includes('twitterbot') ||
    ua.includes('whatsapp')
  );
};

const renderStats = (stats) => {
  const rows = [
    ['Total verified listings', toSafeNumber(stats?.total_properties) ? Number(stats.total_properties).toLocaleString('en-NG') : null],
    ['Average asking rent', formatMoney(stats?.avg_rent)],
    ['Lowest observed', formatMoney(stats?.min_rent)],
    ['Highest observed', formatMoney(stats?.max_rent)],
  ].filter(([, v]) => v);

  if (!rows.length) return '';
  return `
    <h2>Rental market snapshot</h2>
    <table>
      <tbody>
        ${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}
      </tbody>
    </table>`;
};

const renderContentBlocks = (content) => {
  const blocks = [
    ['Overview', content?.overview],
    ['What the market looks like', content?.marketSummary],
    ['How this page is built for renters', content?.strategy],
  ].filter(([, text]) => text);
  return blocks
    .map(([heading, text]) => `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(text)}</p>`)
    .join('\n');
};

const renderFaq = (faq = []) => {
  if (!faq.length) return '';
  const items = faq
    .map(
      (item) => `<h3>${escapeHtml(item.question || item.q)}</h3><p>${escapeHtml(item.answer || item.a)}</p>`
    )
    .join('\n');
  return `<h2>Frequently asked questions</h2>\n${items}`;
};

const renderLinkList = (title, items = []) => {
  if (!items.length) return '';
  return `<h2>${escapeHtml(title)}</h2><ul>${items
    .map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></li>`)
    .join('')}</ul>`;
};

const renderProperties = (properties = []) => {
  if (!properties.length) return '';
  return `
    <h2>Verified properties on this page</h2>
    <ul>
      ${properties
        .map(
          (p) =>
            `<li><a href="${escapeHtml(p.url)}">${escapeHtml(p.title || 'Property')}</a> — ${
              p.city || p.state_name || 'Nigeria'
            }${p.rent_amount ? ` — ${formatMoney(p.rent_amount)}` : ''}</li>`
        )
        .join('')}
    </ul>`;
};

const renderJsonLd = ({ title, description, canonical, faq = [] }) => {
  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
    },
  ];
  if (faq.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question || item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.answer || item.a },
      })),
    });
  }
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
};

const renderShell = ({ title, description, canonical, body, jsonLd }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}"/>
  <link rel="canonical" href="${escapeHtml(canonical)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(description)}"/>
  <meta property="og:url" content="${escapeHtml(canonical)}"/>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1f2937;max-width:880px;margin:0 auto;padding:24px}
    h1{font-size:1.9rem;color:#0f172a}h2{font-size:1.35rem;margin-top:2rem;color:#0f172a}h3{font-size:1.05rem}
    table{border-collapse:collapse;width:100%;max-width:520px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb}
    th{color:#334155}a{color:#2563eb}a:visited{color:#7c3aed}ul{line-height:1.9}
  </style>
  ${jsonLd}
</head>
<body>
  ${body}
</body>
</html>`;

const toSafeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

exports.renderLocationHtml = ({ title, description, canonical, location, stats, content, faq, properties, links }) => {
  const body = `
    <h1>${escapeHtml(title)}</h1>
    ${renderStats(stats)}
    ${renderContentBlocks(content)}
    ${renderFaq(faq)}
    ${renderLinkList('Nearby areas', links?.nearbyAreas || [])}
    ${renderLinkList('Local government areas', links?.lgas || [])}
    ${renderProperties(properties)}`;

  return renderShell({
    title,
    description,
    canonical,
    body,
    jsonLd: renderJsonLd({ title, description, canonical, faq }),
  });
};

exports.renderDirectoryHtml = ({ title, description, canonical, states, popular_areas }) => {
  const body = `
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <h2>States</h2>
    <ul>
      ${(states || [])
        .map(
          (state) =>
            `<li><a href="${escapeHtml(state.url)}">${escapeHtml(state.state_name)}</a>${
              state.lga_count ? ` (${state.lga_count} LGAs)` : ''
            }</li>`
        )
        .join('')}
    </ul>
    ${renderProperties(popular_areas)}`;

  return renderShell({
    title,
    description,
    canonical,
    body,
    jsonLd: renderJsonLd({ title, description, canonical }),
  });
};

exports.renderAreaHtml = ({ title, description, canonical, stats, content, faq, properties, links }) => {
  const body = `
    <h1>${escapeHtml(title)}</h1>
    ${renderStats(stats)}
    ${renderContentBlocks(content)}
    ${renderFaq(faq)}
    ${renderLinkList('Nearby areas', links?.nearbyAreas || [])}
    ${renderProperties(properties)}`;

  return renderShell({
    title,
    description,
    canonical,
    body,
    jsonLd: renderJsonLd({ title, description, canonical, faq }),
  });
};

exports.isSearchCrawler = isSearchCrawler;
