const Ranking = require("../models/Ranking");

exports.saveRanking = async (keyword, url) => {
  // Simulated ranking (replace later with API)
  const position = Math.floor(Math.random() * 100) + 1;

  await Ranking.create({
    keyword,
    url,
    position
  });

  console.log(`📊 Saved ranking for ${keyword}: #${position}`);
};