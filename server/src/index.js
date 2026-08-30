const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || '').split(','),
  credentials: true
}));

// Ensure data directory
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Routes
app.use('/api/tts', require('./routes/tts'));
app.use('/api/claude', require('./routes/claude'));
app.use('/auth', require('./routes/auth'));
app.use('/api/google', require('./routes/google'));
app.use('/api/spotify', require('./routes/spotify'));
app.use('/api/notion', require('./routes/notion'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🤖 JARVIS Backend läuft auf Port ${PORT}`));
