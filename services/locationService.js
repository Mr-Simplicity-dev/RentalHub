const {
  getAreaPageData,
  getLocationPageData,
  getNigeriaDirectoryPage,
} = require('../config/utils/seoPageService');
const {
  isSearchCrawler,
  renderLocationHtml,
  renderDirectoryHtml,
  renderAreaHtml,
} = require('../config/utils/seoHtmlRenderer');

const renderForCrawler = (req, data, renderFn, res) => {
  if (!isSearchCrawler(req.headers['user-agent'])) {
    return false;
  }
  const html = renderFn(data);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(html);
  return true;
};

exports.getNigeriaDirectory = async (req, res) => {
  try {
    const data = await getNigeriaDirectoryPage();
    if (renderForCrawler(req, data, (d) => renderDirectoryHtml(d), res)) {
      return;
    }
    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    req.logger.error('Load Nigeria directory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load Nigeria rental directory',
    });
  }
};

exports.getLocationPage = async (req, res) => {
  try {
    const data = await getLocationPageData({
      stateSlug: req.params.stateSlug,
      lgaSlug: req.params.lgaSlug || null,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Location page not found',
      });
    }

    if (renderForCrawler(req, data, (d) => renderLocationHtml(d), res)) {
      return;
    }

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    req.logger.error('Load location page error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load location page',
    });
  }
};

exports.getAreaPage = async (req, res) => {
  try {
    const data = await getAreaPageData({
      stateSlug: req.params.stateSlug,
      citySlug: req.params.citySlug,
      areaSlug: req.params.areaSlug,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Area page not found',
      });
    }

    if (renderForCrawler(req, data, (d) => renderAreaHtml(d), res)) {
      return;
    }

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    req.logger.error('Load area page error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load area page',
    });
  }
};
