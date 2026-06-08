const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_SOCKET_PAYLOAD_SIZE = 32 * 1024 * 1024;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD_SIZE
});

const rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

function isValidRoomCode(roomCode) {
    return typeof roomCode === 'string' && /^\d{4}$/.test(roomCode);
}

function createRoomCode() {
    let roomCode;

    do {
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[roomCode]);

    return roomCode;
}

function isValidPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;

    if (payload.type === 'text') {
        return typeof payload.value === 'string';
    }

    if (payload.type === 'multiple-files') {
        return Array.isArray(payload.files) && payload.files.every((file) => (
            file &&
            typeof file === 'object' &&
            typeof file.name === 'string' &&
            typeof file.bytes === 'string' &&
            file.bytes.startsWith('data:')
        ));
    }

    return false;
}

function removeSocketFromRooms(socketId) {
    for (const roomCode of Object.keys(rooms)) {
        rooms[roomCode].delete(socketId);

        if (rooms[roomCode].size === 0) {
            delete rooms[roomCode];
        }
    }
}

io.on('connection', (socket) => {
    socket.on('create-room', () => {
        const roomCode = createRoomCode();

        rooms[roomCode] = new Set([socket.id]);
        socket.join(roomCode);
        socket.emit('room-created', roomCode);
    });

    socket.on('join-room', (roomCode) => {
        if (!isValidRoomCode(roomCode)) {
            socket.emit('error-msg', 'Please enter a valid 4-digit room code.');
            return;
        }

        if (!rooms[roomCode]) {
            socket.emit('error-msg', 'Room not found! Check the code.');
            return;
        }

        rooms[roomCode].add(socket.id);
        socket.join(roomCode);
        socket.emit('joined-success', roomCode);
    });

    socket.on('send-data', (message) => {
        if (!message || typeof message !== 'object') return;

        const { roomCode, payload } = message;
        if (!isValidRoomCode(roomCode) || !rooms[roomCode] || !isValidPayload(payload)) return;

        socket.to(roomCode).emit('receive-data', payload);
    });

    socket.on('destroy-room', (roomCode) => {
        if (!isValidRoomCode(roomCode) || !rooms[roomCode]) return;

        io.to(roomCode).emit('room-destroyed');

        rooms[roomCode].forEach((socketId) => {
            const connectedSocket = io.sockets.sockets.get(socketId);
            if (connectedSocket) connectedSocket.leave(roomCode);
        });

        delete rooms[roomCode];
    });

    socket.on('disconnect', () => {
        removeSocketFromRooms(socket.id);
    });
});

function startServer(port = PORT) {
    return server.listen(port, () => {
        console.log(`Drop & Go engine active on port ${port}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    server,
    io,
    rooms,
    startServer,
};
