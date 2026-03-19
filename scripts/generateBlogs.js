require("dotenv").config();

const mongoose = require("mongoose");
const Blog = require("../models/Blog");
const locations = require("../data/nigeriaLocations");
const slugify = require("../utils/slugify");
const { pingGoogle } = require("../utils/pingGoogle");

// ✅ Better Mongo connection handling
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

const templates = [
  (loc) => `Best Areas to Rent a House in ${loc} (2026 Guide)`,
  (loc) => `Cheap Apartments in ${loc}: Prices & Locations`,
  (loc) => `Cost of Renting in ${loc} (Updated 2026)`,
  (loc) => `Top Affordable Places to Live in ${loc}`,
  (loc) => `Where to Find Cheap Houses in ${loc}`
];

const generateContent = (location) => `
Looking for houses for rent in ${location}? This guide covers the best areas, prices, and tips.

Popular rental options in ${location}:
- Self contain apartments
- 1 bedroom flats
- 2 bedroom apartments

Rental prices vary depending on the area and amenities. ${location} offers both affordable and premium housing options.

Start your search today and find the best properties in ${location}.
`;

(async () => {
  await connectDB();

  try {
    console.log("🚀 Generating blog posts...");

    let count = 0;

    for (const state of locations) {
      for (const lga of state.lgas.slice(0, 5)) {

        if (count >= 100) break;

        const location = `${lga}, ${state.displayName}`;

        for (const template of templates) {
          if (count >= 100) break;

          const title = template(location);
          const slug = slugify(title);

          // ✅ Prevent duplicates
          const exists = await Blog.exists({ slug });
          if (exists) continue;

          await Blog.create({
            title,
            slug,
            content: generateContent(location),
            keywords: [
              `rent in ${location}`,
              `apartments in ${location}`,
              `cheap houses in ${location}`
            ]
          });

          count++;
        }
      }

      if (count >= 100) break;
    }

    console.log(`✅ ${count} blog posts created`);

    // 🔥 Ping Google (safe)
    try {
      await pingGoogle();
    } catch (err) {
      console.error("⚠️ Google ping failed:", err.message);
    }

  } catch (err) {
    console.error("❌ Blog generation error:", err);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
    process.exit(0);
  }
})();