const {
  getLandlordPropertyFeeStatus,
  settleLandlordPropertyFee,
  skipLandlordPropertyFeeNotice,
} = require('../config/utils/landlordPropertyFee');

exports.getStatus = async (req, res) => {
  try {
    const status = await getLandlordPropertyFeeStatus(req.user.id);
    res.json({ success: true, data: status });
  } catch (error) {
    req.logger.error('Landlord property fee status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load landlord property billing status',
    });
  }
};

exports.skipNotice = async (req, res) => {
  try {
    const status = await skipLandlordPropertyFeeNotice(req.user.id);
    res.json({
      success: true,
      message: 'Landlord property billing notice skipped for today',
      data: status,
    });
  } catch (error) {
    req.logger.error('Landlord property fee skip error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to skip landlord property billing notice',
    });
  }
};

exports.agreeAndSettle = async (req, res) => {
  try {
    const result = await settleLandlordPropertyFee(req.user.id);
    const status = await getLandlordPropertyFeeStatus(req.user.id);

    res.json({
      success: true,
      message: result.paid
        ? 'Landlord property charges settled successfully'
        : result.message || 'No landlord property charge is due yet',
      data: {
        result,
        status,
      },
    });
  } catch (error) {
    req.logger.error('Landlord property fee settle error:', error);
    let status = null;
    try {
      status = await getLandlordPropertyFeeStatus(req.user.id);
    } catch {
      status = null;
    }

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to settle landlord property charges',
      data: {
        ...(error.data || {}),
        status,
      },
    });
  }
};
