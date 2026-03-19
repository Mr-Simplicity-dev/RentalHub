const Property = require("../models/Property");
const Location = require("../models/Location");
const { generateSEO } = require("../utils/seoHelper");
const { generateContent } = require("../utils/seoContent");
const { generateBlog } = require("../utils/blogGenerator");

exports.getLocationPage = async (req, res) => {
  try {
    const { stateSlug, lgaSlug } = req.params;

    const location = await Location.findOne({
      stateSlug,
      ...(lgaSlug && { lgaSlug })
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // 🏠 Properties
    const query = { state: location.displayName };
    if (lgaSlug) query.lga = location.lga;

    const properties = await Property.find(query).limit(20);

    // 🧠 SEO
    const seo = generateSEO(location.displayName, location.lga);
    const content = generateContent(location.displayName, location.lga);

   const blog = generateBlog(location.displayName, location.lga);
    const canonical = `https://renatalhub.com.ng/nigeria/${location.fullSlug}`;

    // 🔗 INTERNAL LINKS

    // 1. All LGAs in this state
    const stateLGAs = await Location.find({ stateSlug });

    // 2. Other LGAs (exclude current)
    const otherLGAs = stateLGAs
      .filter(l => l.lgaSlug !== lgaSlug)
      .slice(0, 10); // limit for SEO cleanliness

    // 3. State page link
    const statePage = {
      name: location.displayName,
      url: `/nigeria/${stateSlug}`
    };

    res.json({
      seo,
      canonical,
      content,
      location: {
        state: location.displayName,
        lga: location.lga,
        stateSlug,
        lgaSlug
      },
      properties,

      // 🔥 INTERNAL LINKS OUTPUT
      links: {
        statePage,
        lgas: stateLGAs.map(l => ({
          name: l.lga,
          url: `/nigeria/${l.fullSlug}`
        })),
        nearby: otherLGAs.map(l => ({
          name: l.lga,
          url: `/nigeria/${l.fullSlug}`
        }))
      }

    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
