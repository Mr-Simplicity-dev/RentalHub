const skipped = () => ({ success: false, skipped: true, reason: 'INELIGIBLE_CONTENT_TYPE', guidance: 'Use Search Console sitemap submission or URL Inspection. RentalHub has no eligible JobPosting or livestream Indexing API publisher.' });
const submitUrl = async () => skipped();
const submitUrls = async urls => (Array.isArray(urls) ? [...new Set(urls)] : []).map(url => ({ ...skipped(), url }));
module.exports = { submitURL: submitUrl, submitUrl, submitUrls };
