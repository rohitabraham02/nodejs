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
      if (!data || !Array.isArray(data.payload)) {
        ws.send('Invalid payload');
        return;
      }

      const orientationData = data.payload.filter(item => item.name === 'accelerometer');
      const microphoneData = data.payload.filter(item => item.name === 'microphone');

      const db = admin.firestore();
      const batch = db.batch();

      orientationData.forEach(item => {
        if (item.time && item.values) {
          const docRef = db.collection('accelerometer')
            .doc(deviceId)
            .collection(item.time.toString())
            .doc('values');
          batch.set(docRef, item.values);
        }
      });

      microphoneData.forEach(item => {
        if (item.time && item.values) {
          const docRef = db.collection('microphone')
            .doc(deviceId)
            .collection(item.time.toString())
            .doc('values');
          batch.set(docRef, item.values);
        }
      });

      await batch.commit();

      // Emit event to all connected clients
  //    eventEmitter.emit('data', data);

  //    ws.send('Data sent to clients and saved to Firestore successfully');
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
