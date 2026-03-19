exports.generateSEO = (state, lga) => {
  const location = lga ? `${lga}, ${state}` : state;

  return {
    title: `Houses for Rent in ${location} (2026) | Cheap Apartments & Flats`,
    description: `Find houses, self contain, and apartments for rent in ${location}. Affordable listings available now.`,
    keywords: [
      `houses for rent in ${location}`,
      `cheap apartments in ${location}`,
      `self contain in ${location}`,
      `rooms for rent in ${location}`,
      `2 bedroom flat in ${location}`
    ]
  };
};