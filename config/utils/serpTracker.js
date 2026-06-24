const axios = require("axios");

exports.checkRanking = async (keyword) => {
  const apiKey =
    typeof process.env.SERP_API_KEY === "string" &&
    process.env.SERP_API_KEY.trim() &&
    process.env.SERP_API_KEY.trim() !== "..."
      ? process.env.SERP_API_KEY.trim()
      : null;

  if (!apiKey) {
    throw new Error("SERP_API_KEY is not configured");
  }

  try {
    const res = await axios.get("https://serpapi.com/search.json", {
      params: {
        q: keyword,
        hl: "en",
        gl: "ng",
        api_key: apiKey,
      },
      timeout: 15000,
    });

    return res.data.organic_results || [];
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error("SERP_API_KEY is missing or invalid");
    }

    throw error;
  }
};
