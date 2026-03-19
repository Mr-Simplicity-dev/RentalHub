require("dotenv").config();
const mongoose = require("mongoose");
const Location = require("../models/Location");
const locations = require("../data/nigeriaLocations");
const slugify = require("../utils/slugify");

mongoose.connect(process.env.MONGO_URI);

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