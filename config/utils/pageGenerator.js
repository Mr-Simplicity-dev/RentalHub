const slugify = require("./slugify");

exports.generateTitles = (location) => {
  return [
    `Cheap Houses for Rent in ${location}`,
    `Best Apartments in ${location}`,
    `Cost of Living in ${location}`,
    `Affordable Homes in ${location}`,
    `Where to Rent in ${location}`,
    `2 Bedroom Flats in ${location}`,
    `Self Contain in ${location}`,
    `Luxury Apartments in ${location}`,
    `Family Houses in ${location}`,
    `Student Housing in ${location}`
  ];
};