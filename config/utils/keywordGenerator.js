exports.generateKeywords = (state, lga) => {
  const location = `${lga}, ${state}`;

  return [
    `houses for rent in ${location}`,
    `cheap apartments in ${location}`,
    `flats in ${location}`,
    `rent in ${location}`
  ];
};