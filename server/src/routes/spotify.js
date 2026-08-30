const express = require('express');
const router = express.Router();

router.post('/play', (req, res) => {
  res.json({ status: 'Spotify Route - TODO' });
});

module.exports = router;
