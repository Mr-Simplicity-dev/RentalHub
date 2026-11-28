const db = require('../config/middleware/database');
const { createNotification } = require('../config/utils/notificationService');
const { createListingAssistanceService } = require('../services/listingAssistanceService');

const service = createListingAssistanceService({ db, notify: createNotification });

const sendError = (res, error, fallback) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : fallback,
});

const createRequest = async (req, res) => {
  try {
    const result = await service.createRequest(req.user.id, req.body);
    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created
        ? 'Your free listing-assistance request is waiting for staff assignment.'
        : 'You already have a pending request for this location.',
      data: result,
    });
  } catch (error) {
    sendError(res, error, 'Could not submit your listing-assistance request.');
  }
};

const getLandlordStatus = async (req, res) => {
  try {
    res.json({ success: true, data: await service.getLandlordStatus(req.user.id) });
  } catch (error) {
    sendError(res, error, 'Could not load your listing-assistance status.');
  }
};

const listStaffRequests = async (req, res) => {
  try {
    res.json({ success: true, data: await service.listStaffRequests(req.user) });
  } catch (error) {
    sendError(res, error, 'Could not load listing-assistance requests.');
  }
};

const assignRequest = async (req, res) => {
  try {
    const result = await service.assignRequest(
      Number(req.params.requestId),
      Number(req.body.agentId),
      req.user
    );
    res.json({ success: true, message: 'Platform agent assigned successfully.', data: result });
  } catch (error) {
    sendError(res, error, 'Could not assign a platform agent.');
  }
};

module.exports = {
  createRequest,
  getLandlordStatus,
  listStaffRequests,
  assignRequest,
};
