const express = require('express');
const router = express.Router();

router.get('/mails', (req, res) => {
  res.json({ mails: [] });
});

module.exports = router;
