const express = require('express');
const router = express.Router();
const subscriptionRequestController = require('../controllers/subscriptionRequestController');
const authMiddleware = require('../middleware/authMiddleware');
const shopOwnershipMiddleware = require('../middleware/shopOwnershipMiddleware');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

// Shopkeeper routes (require authentication and shop ownership)
router.use(authMiddleware);
router.use(shopOwnershipMiddleware);

router.post('/request', subscriptionRequestController.createSubscriptionRequest);
router.get('/my-request', subscriptionRequestController.getMySubscriptionRequest);
router.get('/my-subscription', subscriptionRequestController.getMySubscription);

// Admin routes (require admin authentication)
router.get('/admin/all', adminAuthMiddleware, subscriptionRequestController.getAllSubscriptionRequests);
router.post('/admin/:id/approve', adminAuthMiddleware, subscriptionRequestController.approveSubscriptionRequest);
router.post('/admin/:id/reject', adminAuthMiddleware, subscriptionRequestController.rejectSubscriptionRequest);

module.exports = router;

