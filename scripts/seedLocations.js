require("dotenv").config();
const mongoose = require("mongoose");
const Location = require("../models/Location");
const locations = require("../data/nigeriaLocations");
const slugify = require("../utils/slugify");

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Missing MONGO_URI or MONGODB_URI in your environment.");
  process.exit(1);
}

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000
});

(async () => {
  try {
    await Location.deleteMany();

    for (const item of locations) {
      const stateSlug = item.slug || slugify(item.displayName);

      for (const lga of item.lgas) {
        const lgaSlug = slugify(lga);

        await Location.create({
          state: item.state,
          displayName: item.displayName,
          lga,
          stateSlug,
          lgaSlug,
          fullSlug: `${stateSlug}/${lgaSlug}`
        });
      }
    }

    console.log("✅ Locations seeded successfully");
    process.exit();

  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exit(1);
  }
})();
