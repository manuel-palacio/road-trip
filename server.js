require('dotenv').config();

const path = require('path');
const express = require('express');

const configRouter = require('./routes/config');
const meRouter = require('./routes/me');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get(['/health', '/actuator/health'], (req, res) => {
  res.json({ status: 'ok' });
});

app.use(configRouter);
app.use(meRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`roadtrip-map listening on :${PORT}`);
});
