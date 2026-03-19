const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/\//g, " ")        // fix cases like "Obio/Akpor"
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
};

module.exports = slugify;