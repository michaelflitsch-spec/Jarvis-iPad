const express = require('express');
const router = express.Router();

router.get('/tasks', (req, res) => {
  res.json({ tasks: [] });
});

module.exports = router;
