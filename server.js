const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`roadtrip-map listening on :${PORT}`);
});
