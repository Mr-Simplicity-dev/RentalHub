const slugify = require("./slugify");

exports.generateBlog = (state, lga) => {
  const location = lga ? `${lga}, ${state}` : state;

  return {
    title: `Best Areas to Rent a House in ${location} (2026 Guide)`,
    slug: slugify(`rent-house-${location}`),
    content: `
Looking for the best places to rent a house in ${location}? This guide covers affordable areas, rental prices, and tips.

Top areas include:
- Affordable zones
- High-demand neighborhoods
- Secure residential areas

Whether you're looking for a self contain or a 2-bedroom flat, ${location} offers multiple options.
`
  };
};