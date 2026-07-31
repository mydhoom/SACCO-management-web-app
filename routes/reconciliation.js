const express = require('express');
const router = express.Router();
const multer = require('multer');
const reconciliationController = require('../controllers/reconciliationController');

// Store file in memory to pass directly to the parser/AI
const upload = multer({ storage: multer.memoryStorage() });

// The frontend must send the file under the key 'statementFile'
router.post('/upload', upload.single('statementFile'), reconciliationController.uploadBankStatement);
router.post('/approve', reconciliationController.approveReconciliation);
router.get('/period', reconciliationController.getStatementByPeriod);
router.post('/save-brs', reconciliationController.saveAndGenerateBRS);

module.exports = router;