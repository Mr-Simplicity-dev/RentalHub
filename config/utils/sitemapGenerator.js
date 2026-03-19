const Location = require("../models/Location");
const Blog = require("../models/Blog");

exports.generateSitemap = async () => {
  const locations = await Location.find();
  const blogs = await Blog.find();

  let urls = "";

  // Location pages
  locations.forEach(loc => {
    urls += `
    <url>
      <loc>https://renatalhub.com.ng/nigeria/${loc.fullSlug}</loc>
    </url>`;
  });

  // Blog pages
  blogs.forEach(blog => {
    urls += `
    <url>
      <loc>https://renatalhub.com.ng/blog/${blog.slug}</loc>
    </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`;
};
