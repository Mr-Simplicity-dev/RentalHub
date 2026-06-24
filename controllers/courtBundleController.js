const bundleService = require('../services/courtBundle.service');

exports.downloadCourtBundle = async (req, res) => {
  try {

    const { disputeId } = req.params;

    const filePath = await bundleService.generateCourtBundle(disputeId);

    res.download(filePath);

  } catch (error) {
    console.error('Court bundle error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate court bundle'
    });
  }
};