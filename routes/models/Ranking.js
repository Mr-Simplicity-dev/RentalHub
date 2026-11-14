const mongoose = require('mongoose');

const rankingSchema = new mongoose.Schema({
  keywordId: { type: String, index: true },
  searchLocation: { type: String, default: "" },
  competitors: [{domain:String,position:Number,url:String,title:String,monitored:Boolean}],
  keyword: { type: String, required: true, trim: true, index: true },
  url: { type: String, required: true, trim: true },
  source: { type: String, required: true, default: 'serpapi', index: true },
  position: { type: Number, default: null, min: 1 },
  found: { type: Boolean, required: true, default: false },
  resultUrl: { type: String, default: null },
  resultTitle: { type: String, default: null },
  searchCountry: { type: String, default: 'ng' },
  searchLanguage: { type: String, default: 'en' },
  searchDepth: { type: Number, default: 100 },
  requestedSearchDepth: { type: Number, default: null },
  resultsReturned: { type: Number, default: null },
  checkedAt: { type: Date, default: Date.now, index: true },
});

rankingSchema.index({ keyword: 1, checkedAt: -1 });

module.exports = mongoose.model('Ranking', rankingSchema);
