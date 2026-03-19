exports.generateContent = (state, lga) => {
  const location = lga ? `${lga}, ${state}` : state;

  return `
Looking for houses for rent in ${location}? Our platform provides verified listings of apartments, flats, self contain, and shared accommodations in ${location}.

Popular rental options in ${location} include:
- Self contain apartments
- 1 bedroom flats
- 2 bedroom apartments
- Family houses

${location} is a growing area with access to schools, markets, transportation, and business opportunities. Rental prices vary depending on location, property type, and amenities.

Start your search today to find affordable and verified rental properties in ${location}.
`;
};