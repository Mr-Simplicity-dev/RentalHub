const verificationService =
  require('../services/evidenceVerification.service');

exports.verifyDispute = async (req, res) => {

  try {

    const { disputeId } = req.params;

    const result =
      await verificationService.verifyDisputeEvidence(disputeId);

    res.json({
      success: true,
      verification: result
    });

  } catch (error) {

    console.error('Verification error:', error);

    res.status(500).json({
      success: false,
      message: 'Verification failed'
    });

  }

};