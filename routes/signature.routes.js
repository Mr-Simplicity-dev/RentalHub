// routes/signature.routes.js
router.post('/keys/generate', authenticate, keyController.generateKeys);
router.post('/documents/:id/sign', authenticate, signatureController.signDocument);
router.post('/signatures/:id/verify', authenticate, signatureController.verify);