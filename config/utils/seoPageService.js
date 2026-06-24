const db = require('../middleware/database');
const nigeriaLocations = require('../../data/nigeriaLocations');
const slugify = require('./slugify');
const { getFrontendUrl } = require('./frontendUrl');

const ACTIVE_PROPERTY_FILTER = `
  p.is_verified = TRUE
  AND COALESCE(p.is_available, TRUE) = TRUE
`;

const SQL_SLUG = (column) =>
  `lower(trim(both '-' from regexp_replace(regexp_replace(coalesce(${column}, ''), '[^A-Za-z0-9]+', '-', 'g'), '-{2,}', '-', 'g')))`;

const baseFrontendUrl = getFrontendUrl();

const datasetByStateSlug = new Map();
nigeriaLocations.forEach((entry) => {
  const keys = [entry.slug, entry.displayName, entry.state]
    .map((value) => slugify(String(value || '')))
    .filter(Boolean);

  keys.forEach((key) => {
    if (!datasetByStateSlug.has(key)) {
      datasetByStateSlug.set(key, {
        state: entry.displayName || entry.state,
        stateSlug: entry.slug || slugify(entry.displayName || entry.state),
        lgas: Array.isArray(entry.lgas) ? entry.lgas.map((item) => String(item)) : [],
      });
    }
  });
});

const pickDeterministic = (seed, values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const index = String(seed || '')
    .split('')
    .reduce((total, char) => total + char.charCodeAt(0), 0) % values.length;

  return values[index];
};

const formatMoney = (amount) => {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return null;
  }

  return `N${Math.round(Number(amount)).toLocaleString('en-NG')}`;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildKeywordTargets = (locationLabel) => {
  const base = String(locationLabel || '').trim();
  return [
    `houses for rent in ${base}`,
    `apartments for rent in ${base}`,
    `cheap rent in ${base}`,
    `2 bedroom flat in ${base}`,
    `self contain in ${base}`,
    `verified rentals in ${base}`,
  ];
};

const buildFaqItems = ({ locationLabel, stats }) => {
  const avgRentText = formatMoney(stats.avg_rent);

  return [
    {
      question: `How much is rent in ${locationLabel}?`,
      answer: avgRentText
        ? `Average verified asking rent around ${locationLabel} is about ${avgRentText}, but actual pricing depends on property type, finish, and street demand.`
        : `Rent in ${locationLabel} varies by property type, condition, and how close the home is to major roads, schools, or work hubs.`,
    },
    {
      question: `Can I find cheap rent in ${locationLabel}?`,
      answer: `Yes. The best approach is to compare verified listings, focus on smaller flats or self-contain units, and monitor fresh listings in ${locationLabel} regularly.`,
    },
    {
      question: `What property types are common in ${locationLabel}?`,
      answer: stats.top_property_types?.length
        ? `Common verified options in ${locationLabel} include ${stats.top_property_types.join(', ')}.`
        : `You can typically find self-contain units, flats, and family houses in ${locationLabel}.`,
    },
  ];
};

const buildSeoBlocks = ({ seed, locationLabel, propertyLabel, stats }) => {
  const introOpeners = [
    `Looking for ${propertyLabel} in ${locationLabel}?`,
    `Searching for verified rental options in ${locationLabel}?`,
    `${locationLabel} is one of the rental markets people monitor closely for fresh listings.`,
  ];

  const marketAngles = [
    `The market in ${locationLabel} attracts renters who want a balance of affordability, access, and verified listings.`,
    `Rental demand in ${locationLabel} usually follows road access, neighbourhood reputation, and the type of homes entering the market.`,
    `If you want cheap rent in ${locationLabel}, timing, property type, and exact street still matter more than state-wide averages.`,
  ];

  const intro = pickDeterministic(`${seed}:intro`, introOpeners);
  const marketAngle = pickDeterministic(`${seed}:market`, marketAngles);
  const avgRentText = formatMoney(stats.avg_rent);
  const minRentText = formatMoney(stats.min_rent);
  const maxRentText = formatMoney(stats.max_rent);
  const propertyCount = toNumber(stats.total_properties);

  const overview = [
    intro,
    propertyCount
      ? `Right now, the platform has ${propertyCount.toLocaleString('en-NG')} verified property listing${propertyCount === 1 ? '' : 's'} connected to this page.`
      : `This page is designed to capture rental demand around ${locationLabel} even when listing supply is still growing.`,
    avgRentText
      ? `Current verified asking rents cluster around ${avgRentText}${minRentText && maxRentText ? `, with observed prices ranging from ${minRentText} to ${maxRentText}` : ''}.`
      : `Pricing in ${locationLabel} shifts by property size, finish level, and how close the home is to transport, schools, and daily commerce.`,
  ].join(' ');

  const marketSummary = [
    marketAngle,
    stats.top_property_types?.length
      ? `Verified inventory on this page currently leans toward ${stats.top_property_types.join(', ')}.`
      : `Renters usually compare self-contain units, one-bedroom flats, and family-sized apartments before deciding.`,
    `For long-tail searches like "cheap rent in ${locationLabel}" or "2 bedroom flat in ${locationLabel}", users usually care about price, trust, and available photos more than anything else.`,
  ].join(' ');

  const strategy = [
    `To rank for high-intent searches around ${locationLabel}, this page targets cheap rent, apartments, flats, and verified listing intent at the same time.`,
    `Internal links connect ${locationLabel} to nearby areas, state-level pages, and live property detail pages so Google can understand local relevance and crawl depth.`,
    `The content is generated with location-specific statistics and deterministic copy variation so pages do not collapse into duplicate text.`,
  ].join(' ');

  return {
    overview,
    marketSummary,
    strategy,
  };
};

const buildStateMatch = (stateRows, stateSlug) =>
  stateRows.find((state) => {
    const keys = [
      state.state_name,
      state.state_code,
    ]
      .map((value) => slugify(String(value || '')))
      .filter(Boolean);

    return keys.includes(String(stateSlug || '').trim());
  }) || null;

const fetchStates = async () => {
  const { rows } = await db.query(
    `SELECT id, state_name, state_code
     FROM states
     ORDER BY state_name ASC`
  );

  return rows.map((row) => ({
    ...row,
    state_slug: slugify(row.state_name),
    dataset: datasetByStateSlug.get(slugify(row.state_name)) || datasetByStateSlug.get(slugify(row.state_code)) || null,
  }));
};

const fetchStateStats = async (stateId) => {
  const statsResult = await db.query(
    `SELECT
       COUNT(*)::INT AS total_properties,
       ROUND(AVG(COALESCE(p.rent_amount, p.price))::numeric, 0) AS avg_rent,
       MIN(COALESCE(p.rent_amount, p.price)) AS min_rent,
       MAX(COALESCE(p.rent_amount, p.price)) AS max_rent
     FROM properties p
     WHERE p.state_id = $1
       AND ${ACTIVE_PROPERTY_FILTER}`,
    [stateId]
  );

  const propertyTypeResult = await db.query(
    `SELECT p.property_type, COUNT(*)::INT AS total
     FROM properties p
     WHERE p.state_id = $1
       AND ${ACTIVE_PROPERTY_FILTER}
     GROUP BY p.property_type
     ORDER BY total DESC, p.property_type ASC
     LIMIT 3`,
    [stateId]
  );

  return {
    ...statsResult.rows[0],
    top_property_types: propertyTypeResult.rows
      .map((row) => row.property_type)
      .filter(Boolean),
  };
};

const fetchProperties = async ({
  stateId,
  lgaSlug = null,
  citySlug = null,
  areaSlug = null,
  limit = 12,
}) => {
  const params = [stateId, limit];
  let where = `p.state_id = $1 AND ${ACTIVE_PROPERTY_FILTER}`;

  if (citySlug && areaSlug) {
    params.splice(1, 0, citySlug, areaSlug);
    where += `
      AND ${SQL_SLUG("COALESCE(NULLIF(TRIM(p.city), ''), s.state_name)")} = $2
      AND ${SQL_SLUG("COALESCE(NULLIF(TRIM(p.area), ''), NULLIF(TRIM(p.city), ''), s.state_name)")} = $3`;
  } else if (lgaSlug) {
    params.splice(1, 0, lgaSlug);
    where += `
      AND (
        ${SQL_SLUG('p.city')} = $2
        OR ${SQL_SLUG('p.area')} = $2
      )`;
  }

  const offsetIndex = params.length;
  const result = await db.query(
    `SELECT
       p.id,
       p.title,
       p.property_type,
       COALESCE(p.rent_amount, p.price) AS rent_amount,
       p.city,
       p.area,
       p.bedrooms,
       p.bathrooms,
       s.state_name,
       (
         SELECT photo_url
         FROM property_photos ph
         WHERE ph.property_id = p.id
         ORDER BY ph.is_primary DESC, ph.upload_order ASC, ph.id ASC
         LIMIT 1
       ) AS primary_photo
     FROM properties p
     JOIN states s ON s.id = p.state_id
     WHERE ${where}
     ORDER BY p.created_at DESC
     LIMIT $${offsetIndex}`,
    params
  );

  return result.rows;
};

const fetchAreaRows = async ({ stateId = null, limit = null } = {}) => {
  const params = [];
  const where = [`${ACTIVE_PROPERTY_FILTER}`];

  if (stateId) {
    params.push(stateId);
    where.push(`p.state_id = $${params.length}`);
  }

  const limitClause = limit ? `LIMIT ${Number(limit)}` : '';
  const result = await db.query(
    `SELECT *
     FROM (
       SELECT
         p.state_id,
         s.state_name,
         COALESCE(NULLIF(TRIM(p.city), ''), s.state_name) AS city_name,
         COALESCE(NULLIF(TRIM(p.area), ''), NULLIF(TRIM(p.city), ''), s.state_name) AS area_name,
         COUNT(*)::INT AS property_count,
         ROUND(AVG(COALESCE(p.rent_amount, p.price))::numeric, 0) AS avg_rent,
         MIN(COALESCE(p.rent_amount, p.price)) AS min_rent,
         MAX(COALESCE(p.rent_amount, p.price)) AS max_rent
       FROM properties p
       JOIN states s ON s.id = p.state_id
       WHERE ${where.join(' AND ')}
       GROUP BY
         p.state_id,
         s.state_name,
         COALESCE(NULLIF(TRIM(p.city), ''), s.state_name),
         COALESCE(NULLIF(TRIM(p.area), ''), NULLIF(TRIM(p.city), ''), s.state_name)
     ) areas
     ORDER BY areas.property_count DESC, areas.state_name ASC, areas.city_name ASC, areas.area_name ASC
     ${limitClause}`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    state_slug: slugify(row.state_name),
    city_slug: slugify(row.city_name),
    area_slug: slugify(row.area_name),
    url: `/areas/${slugify(row.state_name)}/${slugify(row.city_name)}/${slugify(row.area_name)}`,
  }));
};

const buildPropertyCard = (property) => ({
  id: property.id,
  title: property.title,
  property_type: property.property_type,
  rent_amount: toNumber(property.rent_amount),
  city: property.city,
  area: property.area,
  bedrooms: property.bedrooms,
  bathrooms: property.bathrooms,
  state_name: property.state_name,
  primary_photo: property.primary_photo,
  url: `/properties/${property.id}`,
});

const buildLocationResponse = async ({ stateSlug, lgaSlug = null }) => {
  const states = await fetchStates();
  const state = buildStateMatch(states, stateSlug);

  if (!state) {
    return null;
  }

  const dataset = state.dataset;
  let matchedLga = null;
  if (lgaSlug) {
    matchedLga = dataset?.lgas?.find((lga) => slugify(lga) === slugify(lgaSlug)) || null;
    if (!matchedLga) {
      return null;
    }
  }

  const stats = await fetchStateStats(state.id);
  const rawProperties = await fetchProperties({
    stateId: state.id,
    lgaSlug: matchedLga ? slugify(matchedLga) : null,
  });
  const properties = rawProperties.map(buildPropertyCard);
  const areaRows = await fetchAreaRows({ stateId: state.id, limit: 12 });

  const locationLabel = matchedLga ? `${matchedLga}, ${state.state_name}` : state.state_name;
  const keywordTargets = buildKeywordTargets(locationLabel);
  const primaryKeyword = pickDeterministic(`${stateSlug}:${lgaSlug || 'state'}:keyword`, keywordTargets);
  const seoBlocks = buildSeoBlocks({
    seed: `${stateSlug}:${lgaSlug || 'state'}`,
    locationLabel,
    propertyLabel: primaryKeyword,
    stats,
  });
  const faq = buildFaqItems({ locationLabel, stats });
  const canonical = matchedLga
    ? `${baseFrontendUrl}/nigeria/${state.state_slug}/${slugify(matchedLga)}`
    : `${baseFrontendUrl}/nigeria/${state.state_slug}`;

  return {
    page_type: matchedLga ? 'lga' : 'state',
    seo: {
      title: matchedLga
        ? `${primaryKeyword} | Verified rentals in ${locationLabel}`
        : `Houses for rent in ${state.state_name} | Verified flats and apartments`,
      description: matchedLga
        ? `Explore verified rentals, flats, apartments, and cheap rent opportunities in ${locationLabel}. Compare prices, browse fresh listings, and monitor top neighbourhoods.`
        : `Browse verified houses, flats, and apartments for rent in ${state.state_name}. Compare pricing, popular areas, and live rental inventory across the state.`,
      keywords: keywordTargets,
    },
    canonical,
    location: {
      state: state.state_name,
      stateSlug: state.state_slug,
      lga: matchedLga,
      lgaSlug: matchedLga ? slugify(matchedLga) : null,
    },
    stats,
    content: seoBlocks,
    faq,
    keyword_targets: keywordTargets,
    properties,
    links: {
      lgas: (dataset?.lgas || []).map((lga) => ({
        name: lga,
        url: `/nigeria/${state.state_slug}/${slugify(lga)}`,
      })),
      areas: areaRows.slice(0, 10).map((area) => ({
        name: area.area_name,
        url: area.url,
        property_count: area.property_count,
      })),
      statePage: matchedLga
        ? {
            name: state.state_name,
            url: `/nigeria/${state.state_slug}`,
          }
        : null,
    },
  };
};

const buildAreaResponse = async ({ stateSlug, citySlug, areaSlug }) => {
  const states = await fetchStates();
  const state = buildStateMatch(states, stateSlug);

  if (!state) {
    return null;
  }

  const areaRows = await fetchAreaRows({ stateId: state.id });
  const area = areaRows.find(
    (row) => row.city_slug === slugify(citySlug) && row.area_slug === slugify(areaSlug)
  );

  if (!area) {
    return null;
  }

  const rawProperties = await fetchProperties({
    stateId: state.id,
    citySlug: area.city_slug,
    areaSlug: area.area_slug,
  });
  const properties = rawProperties.map(buildPropertyCard);
  const locationLabel = `${area.area_name}, ${area.state_name}`;
  const keywordTargets = buildKeywordTargets(locationLabel);
  const primaryKeyword = pickDeterministic(`${stateSlug}:${citySlug}:${areaSlug}`, keywordTargets);
  const seoBlocks = buildSeoBlocks({
    seed: `${stateSlug}:${citySlug}:${areaSlug}`,
    locationLabel,
    propertyLabel: primaryKeyword,
    stats: area,
  });
  const faq = buildFaqItems({ locationLabel, stats: area });
  const canonical = `${baseFrontendUrl}${area.url}`;

  const nearbyAreas = areaRows
    .filter((row) => row.area_slug !== area.area_slug || row.city_slug !== area.city_slug)
    .slice(0, 12)
    .map((row) => ({
      name: row.area_name,
      city_name: row.city_name,
      url: row.url,
      property_count: row.property_count,
    }));

  return {
    page_type: 'area',
    seo: {
      title: `${primaryKeyword} | Verified rentals in ${locationLabel}`,
      description: `Track verified flats, apartments, and cheap rent opportunities in ${locationLabel}. Compare average pricing, see live listings, and explore nearby rental hotspots.`,
      keywords: keywordTargets,
    },
    canonical,
    area: {
      state: area.state_name,
      stateSlug: area.state_slug,
      city: area.city_name,
      citySlug: area.city_slug,
      name: area.area_name,
      areaSlug: area.area_slug,
    },
    stats: {
      total_properties: area.property_count,
      avg_rent: area.avg_rent,
      min_rent: area.min_rent,
      max_rent: area.max_rent,
      top_property_types: [],
    },
    content: seoBlocks,
    faq,
    keyword_targets: keywordTargets,
    properties,
    links: {
      statePage: {
        name: area.state_name,
        url: `/nigeria/${area.state_slug}`,
      },
      nearbyAreas,
    },
  };
};

const getNigeriaDirectoryPage = async () => {
  const states = await fetchStates();
  const popularAreas = await fetchAreaRows({ limit: 20 });

  return {
    seo: {
      title: 'Nigeria rental directory | States, LGAs, and high-intent rental areas',
      description: 'Explore Nigeria rental pages by state, LGA, and area. Discover verified rent data, location guides, and live property inventory across the country.',
    },
    canonical: `${baseFrontendUrl}/nigeria`,
    states: states.map((state) => ({
      id: state.id,
      state_name: state.state_name,
      state_slug: state.state_slug,
      lga_count: state.dataset?.lgas?.length || 0,
      url: `/nigeria/${state.state_slug}`,
    })),
    popular_areas: popularAreas,
  };
};

const getSitemapUrls = async () => {
  const urls = new Set([
    `${baseFrontendUrl}/`,
    `${baseFrontendUrl}/properties`,
    `${baseFrontendUrl}/nigeria`,
    `${baseFrontendUrl}/landlord-guide`,
  ]);

  const states = await fetchStates();
  states.forEach((state) => {
    urls.add(`${baseFrontendUrl}/nigeria/${state.state_slug}`);
    (state.dataset?.lgas || []).forEach((lga) => {
      urls.add(`${baseFrontendUrl}/nigeria/${state.state_slug}/${slugify(lga)}`);
    });
  });

  const areaRows = await fetchAreaRows();
  areaRows.forEach((row) => {
    urls.add(`${baseFrontendUrl}${row.url}`);
  });

  const propertyRows = await db.query(
    `SELECT id
     FROM properties p
     WHERE ${ACTIVE_PROPERTY_FILTER}`
  );

  propertyRows.rows.forEach((row) => {
    urls.add(`${baseFrontendUrl}/properties/${row.id}`);
  });

  return Array.from(urls);
};

module.exports = {
  getAreaPageData: buildAreaResponse,
  getLocationPageData: buildLocationResponse,
  getNigeriaDirectoryPage,
  getSitemapUrls,
};
