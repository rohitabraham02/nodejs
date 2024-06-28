const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = socketIo(server);

// Store connected clients
const clients = {};

io.on('connection', (socket) => {
  console.log('A client connected');
  socket.on('register', (deviceId) => {
    if (!clients[deviceId]) {
      clients[deviceId] = [];
    }
    clients[deviceId].push(socket);
    console.log(`Device ${deviceId} connected`);
  });

  socket.on('disconnect', () => {
    for (let deviceId in clients) {
      clients[deviceId] = clients[deviceId].filter(client => client !== socket);
      if (clients[deviceId].length === 0) {
        delete clients[deviceId];
      }
    }
    console.log('A client disconnected');
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
        client.emit('data', item);
      });
    }
  });

  res.status(200).send('Data sent to clients successfully');
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
