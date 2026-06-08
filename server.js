const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 32 * 1024 * 1024 // Data URLs add base64 overhead to the 20MB file limit.
});

app.use(express.static(path.join(__dirname, 'public')));

// مخزن الغرف المؤقت في الرام
const rooms = {};

io.on('connection', (socket) => {
    
    // 1. إنشاء غرفة جديدة
    socket.on('create-room', () => {
        let roomCode;
        do {
            roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        } while (rooms[roomCode]);

        rooms[roomCode] = new Set();
        rooms[roomCode].add(socket.id);
        socket.join(roomCode);
        socket.emit('room-created', roomCode);
    });

    // 2. الانضمام لغرفة موجودة
    socket.on('join-room', (roomCode) => {
        if (rooms[roomCode]) {
            rooms[roomCode].add(socket.id);
            socket.join(roomCode);
            socket.emit('joined-success', roomCode);
        } else {
            socket.emit('error-msg', 'Room not found! Check the code.');
        }
    });

    // 3. البث الفوري والموحد للبيانات (نصوص أو حزمة ملفات متعددة)
    socket.on('send-data', ({ roomCode, payload }) => {
        if (rooms[roomCode]) {
            socket.to(roomCode).emit('receive-data', payload);
        }
    });

    // 4. تدمير الغرفة والتنظيف الذاتي الفوري
    socket.on('destroy-room', (roomCode) => {
        if (rooms[roomCode]) {
            io.to(roomCode).emit('room-destroyed');
            // إخراج كل السوكيتات من الغرفة برمجياً
            rooms[roomCode].forEach(id => {
                const s = io.sockets.sockets.get(id);
                if (s) s.leave(roomCode);
            });
            delete rooms[roomCode];
        }
    });

    socket.on('disconnect', () => {
        // تنظيف الغرف الفارغة إذا انقطع اتصال المستخدم تلقائياً
        for (const roomCode in rooms) {
            if (rooms[roomCode].has(socket.id)) {
                rooms[roomCode].delete(socket.id);
                if (rooms[roomCode].size === 0) {
                    delete rooms[roomCode];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`⚡ Drop & Go engine active on port ${PORT}`));
