exports.generateAIContent = (location) => {
  const intros = [
    `Looking for houses for rent in ${location}?`,
    `Searching for affordable apartments in ${location}?`,
    `Need a place to stay in ${location}?`
  ];

  const intro = intros[Math.floor(Math.random() * intros.length)];

  return `
# Houses for Rent in ${location}

${intro} This guide explains rental options, pricing, and tips for tenants.

## Available Property Types
- Self contain apartments
- 1 bedroom flats
- 2 bedroom apartments
- Duplexes

## Cost of Renting in ${location}
Prices vary based on:
- Location
- Property type
- Amenities

## Why Choose ${location}?
- Affordable living
- Good infrastructure
- Growing economy

## Rental Tips
- Inspect property before payment
- Verify landlord identity
- Compare prices

## Final Thoughts
${location} offers great rental opportunities for individuals and families.
`;
};