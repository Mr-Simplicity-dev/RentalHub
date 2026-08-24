const slugify = require("./slugify");

exports.generateBacklinks = (state, lga) => {
  const location = `${lga}, ${state}`;
  const stateSlug = slugify(state);

  return `
## Related Searches

- [Houses for rent in ${location}](/nigeria/${stateSlug}/${slugify(lga)})
- [Cheap apartments in ${location}](/nigeria/${stateSlug}/${slugify(lga)})
- [Flats available in ${location}](/nigeria/${stateSlug}/${slugify(lga)})

## Explore ${state}
- [View all properties in ${state}](/nigeria/${stateSlug})
`;
};