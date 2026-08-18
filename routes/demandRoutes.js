// routes/demandRoutes.js
const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const dc = require('../controllers/demandController');

const adminOrExec = authorize(['admin', 'executive']);

// GET  /api/demand/generate          — Generate demand list (read-only preview)
router.get('/generate', dc.generateDemandSheet);

// POST /api/demand/create-batch      — Save demand list as a clearance batch
router.post('/create-batch', authenticate, adminOrExec, dc.createDemandBatch);

// GET  /api/demand/batches           — All batches summary (no member details)
router.get('/batches', authenticate, adminOrExec, dc.getDemandBatches);

// GET  /api/demand/batches/:batchId  — Single batch with full member breakdown
router.get('/batches/:batchId', authenticate, adminOrExec, dc.getDemandBatchById);

// PUT  /api/demand/batches/:batchId/members/:vendorNo  — Edit member amounts
router.put('/batches/:batchId/members/:vendorNo', authenticate, adminOrExec, dc.updateBatchMember);

// DELETE /api/demand/batches/:batchId/members/:vendorNo — Exclude member
router.delete('/batches/:batchId/members/:vendorNo', authenticate, adminOrExec, dc.removeBatchMember);

// POST /api/demand/batches/:batchId/clear — Clear selected members & post to ledger
router.post('/batches/:batchId/clear', authenticate, adminOrExec, dc.clearBatchMembers);

module.exports = router;
