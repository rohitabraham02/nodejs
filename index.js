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
      if (!data || typeof data.channel !== 'string' || typeof data.data !== 'string') {
        ws.send('Invalid payload');
        return;
      }

      const db = admin.firestore();
      const batch = db.batch();

      if (data.channel === 'accelerometer' || data.channel === 'microphone') {
        const docRef = db.collection(data.channel)
          .doc(deviceId)
          .collection(Date.now().toString())
          .doc('values');
        batch.set(docRef, { value: data.data });
      } else {
        ws.send('Unsupported channel');
        return;
      }

      await batch.commit();

      // Emit event to all connected clients
      eventEmitter.emit('data', data);

      ws.send('Data sent to clients and saved to Firestore successfully');
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send('Internal Server Error');
    }
  });
});

eventEmitter.on('data', (data) => {
  // Broadcast data to all connected WebSocket clients
  for (const deviceId in clients) {
    clients[deviceId].forEach(client => {
      client.send(JSON.stringify(data));
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
