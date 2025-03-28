const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const admin = require('firebase-admin');
const EventEmitter = require('events');

admin.initializeApp({
  credential: admin.credential.applicationDefault()
});
//var someObject = require('./service.json')

//admin.initializeApp({ credential: admin.credential.cert(someObject)});
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
  console.log("+++data++++");
  console.log(data);
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
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    const tenantToken = await admin.auth().tenantManager().getTenant(decodedIdToken.firebase.tenant);
    const { deviceId, channel, data } = req.body;
    
    if (!deviceId || typeof channel !== 'string' || !data) {
      res.status(400).send({ error: 'Invalid payload' });
      return;
    }
    
    const channelId =data.name;
    const  zone  = data.zone;
    const  sensorId = data.sensorId || data.name;
    const db = admin.firestore();
    const batch = db.batch();
    
    const tenantName = tenantToken.displayName;
    const timestamp = Date.now().toString();
    console.log(tenantName)
    // Device document
    const deviceDocRef = db
      .collection("automate-ai")
      .doc(tenantName)
      .collection("ai-senses")
      .doc(deviceId);
    
    batch.set(deviceDocRef, { 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Zone document
    const zoneDocRef = deviceDocRef
      .collection("zones")
      .doc(zone);
    
    batch.set(zoneDocRef, { 
      zoneId: zone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
    
    // Channel document
    const channelDocRef = zoneDocRef
      .collection("channels")
      .doc(channelId);
    
    batch.set(channelDocRef, { 
      channelId: channelId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
    
    // Sensor document
    const sensorDocRef = channelDocRef
      .collection("sensors")
      .doc(sensorId);
    
    batch.set(sensorDocRef, { 
      sensorId: sensorId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    }, { merge: true });
    
    // Data document (same as before)
    const dataDocRef = sensorDocRef
      .collection("timestamp")
      .doc(timestamp);
    
    batch.set(dataDocRef, { value: data });
    
    await batch.commit();
    // Emit data AFTER successful commit to Firebase
    eventEmitter.emit('data', { deviceId, channel, data });
    
    res.status(200).send({ success: true });

  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send({ error: 'Error processing message' });
  }
});


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
