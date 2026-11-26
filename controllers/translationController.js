const translationService = require('../services/translationService');

const handleTranslation = (operation) => async (req, res) => {
  try {
    const data = await operation(req);
    return res.json({ success: true, data });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode).json({
      success: false,
      code: error?.code || 'TRANSLATION_FAILED',
      message: statusCode >= 500 ? 'Translation failed. Please try again.' : error.message,
    });
  }
};

exports.translatePropertyDescription = handleTranslation((req) =>
  translationService.translatePropertyDescriptionForUser({
    user: req.user,
    propertyId: req.params.propertyId,
    targetLanguage: req.body?.target_language,
  })
);

exports.translateMessage = handleTranslation((req) =>
  translationService.translateMessageForUser({
    user: req.user,
    messageId: req.params.messageId,
    targetLanguage: req.body?.target_language,
  })
);
