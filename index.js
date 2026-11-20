require('dotenv').config();
const express = require('express');
const cors = require('cors');

const cropRoutes = require('./routes/crop');
const chatRoutes = require('./routes/chat');
const weatherRoutes = require('./routes/weather');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/crop', cropRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/weather', weatherRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});