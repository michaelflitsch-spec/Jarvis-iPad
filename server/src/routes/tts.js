const express = require('express');
const https = require('https');
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam voice

router.post('/', async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Text erforderlich' });
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ElevenLabs API Key nicht konfiguriert' });

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${VOICE_ID}`,
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    }
  };

  const request = https.request(options, (response) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    response.pipe(res);
  });

  request.on('error', (error) => {
    console.error('ElevenLabs Error:', error);
    res.status(500).json({ error: 'TTS Fehler' });
  });

  request.write(JSON.stringify({
    text,
    model_id: 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75
    }
  }));

  request.end();
});

module.exports = router;
