const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const admin = require('firebase-admin');
const EventEmitter = require('events');

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const eventEmitter = new EventEmitter();

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

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      // Emit event to all connected clients except the sender
      eventEmitter.emit('data', data, ws);

    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Error processing message' }));
    }
  });
});

eventEmitter.on('data', (data, senderWs) => {
  // Broadcast data to all connected WebSocket clients except the sender
  for (const deviceId in clients) {
    clients[deviceId].forEach(client => {
      if (client !== senderWs) {
        client.send(JSON.stringify(data));
      }
    });
  }
});

app.post('/', async (req, res) => {
  try {
    const { deviceId, channel, data } = req.body;

    if (!deviceId || typeof channel !== 'string' || !data) {
      res.status(400).send({ error: 'Invalid payload' });
      return;
    }

    const db = admin.firestore();
    const batch = db.batch();
 console.log(req.body);
    if (['accelerometer', 'microphone', 'ambientlight', 'location', 'gyroscope', 'absoluteorientation', 'battery'].includes(channel)) {
      const docRef = db.collection(channel)
        .doc(deviceId)
        .collection(Date.now().toString())
        .doc('values');
      batch.set(docRef, { value: data });
    } else {
      res.status(400).send({ error: 'Unsupported channel' });
      return;
    }

    await batch.commit();

    // Emit event to all connected clients except the sender

    res.status(200).send({ success: true });

  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send({ error: 'Error processing message' });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
