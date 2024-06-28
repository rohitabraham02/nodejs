const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = {};

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const deviceId = params.get('deviceId');

  if (!deviceId) {
    ws.close(1008, 'Device ID required');
    return;
  }

  if (!clients[deviceId]) {
    clients[deviceId] = [];
  }

  clients[deviceId].push(ws);

  ws.on('close', () => {
    clients[deviceId] = clients[deviceId].filter(client => client !== ws);
    if (clients[deviceId].length === 0) {
      delete clients[deviceId];
    }
  });

  ws.on('message', (message) => {
    console.log(`Received message from ${deviceId}: ${message}`);
  });
});

app.post('/', (req, res) => {
  const data = req.body;

  if (!data || !Array.isArray(data.payload)) {
    res.status(400).send('Invalid payload');
    return;
  }

  // Notify connected WebSocket clients
  data.payload.forEach(item => {
    if (clients[item.deviceId]) {
      clients[item.deviceId].forEach(client => {
        client.send(JSON.stringify(item));
      });
    }
  });

  res.status(200).send('Data sent to clients successfully');
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
