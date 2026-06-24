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

const getMongoConnectionHint = (error) => {
  const message = String(error?.message || "").toLowerCase();

  if (mongoUri.includes("<db_password>")) {
    return "Your Mongo URI still contains the <db_password> placeholder. Replace it with the real Atlas database user password.";
  }

  if (message.includes("bad auth") || message.includes("authentication failed")) {
    return "Mongo authentication failed. Confirm the Atlas database username and password, and URL-encode the password if it contains special characters like @ : / ? # & %.";
  }

  if (message.includes("enotfound") || message.includes("querysrv")) {
    return "Mongo host lookup failed. Recheck the Atlas cluster hostname in your connection string.";
  }

  return null;
};

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    const hint = getMongoConnectionHint(error);
    if (hint) {
      console.error(`Hint: ${hint}`);
    }
    process.exit(1);
  }
};

(async () => {
  try {
    await connectDB();
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
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("🔌 MongoDB connection closed");
    }
  }
})();
