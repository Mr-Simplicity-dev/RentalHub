const courtBundleController = require('../controllers/courtBundleController');

router.post(
  '/disputes/:disputeId/seal',
  authenticate,
  allowRoles('admin','lawyer'),
  disputeController.sealDispute
);



router.get(
  '/:disputeId/court-bundle',
  authenticate,
  allowRoles('admin','lawyer','super_admin'),
  courtBundleController.downloadCourtBundle
);