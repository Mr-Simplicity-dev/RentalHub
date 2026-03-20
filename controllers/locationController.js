const {
  getAreaPageData,
  getLocationPageData,
  getNigeriaDirectoryPage,
} = require('../config/utils/seoPageService');

exports.getNigeriaDirectory = async (req, res) => {
  try {
    const data = await getNigeriaDirectoryPage();
    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Load Nigeria directory error:', error);
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

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Load location page error:', error);
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

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error('Load area page error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load area page',
    });
  }
};
