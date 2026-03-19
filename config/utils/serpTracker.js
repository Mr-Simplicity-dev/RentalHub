const axios = require("axios");

exports.checkRanking = async (keyword) => {
  const API_KEY = process.env.SERP_API_KEY;

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(
    keyword
  )}&hl=en&gl=ng&api_key=${API_KEY}`;

  const res = await axios.get(url);

  return res.data.organic_results || [];
};