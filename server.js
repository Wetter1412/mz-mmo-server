// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const players = {};
const battles = {};

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // ĐĂNG NHẬP
    socket.on('login', (payload) => {
        try {
            if (!payload) return;
            players[socket.id] = { id: socket.id, ...payload };
            
            const roomName = `map_${payload.mapId}`;
            socket.join(roomName);
            
            // Trả danh sách người trong map cho người mới
            const mapPlayers = Object.values(players).filter(p => p.mapId === payload.mapId && p.id !== socket.id);
            socket.emit('initMapPlayers', mapPlayers);

            // Báo có người mới cho map
            socket.to(roomName).emit('playerJoined', players[socket.id]);
        } catch (err) { console.error('Error login:', err); }
    });

    // DI CHUYỂN
    socket.on('move', (payload) => {
        try {
            if (!players[socket.id] || !payload) return;
            players[socket.id].x = payload.x;
            players[socket.id].y = payload.y;
            players[socket.id].direction = payload.direction;

            socket.to(`map_${players[socket.id].mapId}`).emit('playerMoved', {
                id: socket.id, x: payload.x, y: payload.y, direction: payload.direction
            });
        } catch (err) { console.error('Error move:', err); }
    });

    // CHUYỂN MAP (ĐÃ SỬA LỖI MÙ MAP)
    socket.on('changeMap', (payload) => {
        try {
            if (!players[socket.id] || !payload) return;
            const p = players[socket.id];
            
            socket.leave(`map_${p.mapId}`);
            socket.to(`map_${p.mapId}`).emit('playerLeft', socket.id); // Xóa bóng ở map cũ
            
            p.mapId = payload.mapId;
            p.x = payload.x; // Cập nhật ngay tọa độ mới tránh bóng ma
            p.y = payload.y;
            p.direction = payload.d;
            
            socket.join(`map_${p.mapId}`);
            
            // GỬI LẠI DANH SÁCH NGƯỜI CHƠI BÊN MAP MỚI CHO CLIENT NÀY
            const mapPlayers = Object.values(players).filter(x => x.mapId === p.mapId && x.id !== socket.id);
            socket.emit('initMapPlayers', mapPlayers);
            
            // Báo cho mọi người ở map mới
            socket.to(`map_${p.mapId}`).emit('playerJoined', p);
        } catch (err) { console.error('Error changeMap:', err); }
    });

    // TƯƠNG TÁC TỔ ĐỘI & PK
    socket.on('pkRequest', (payload) => handleRequest(socket, payload, 'PK'));
    socket.on('inviteParty', (payload) => handleRequest(socket, payload, 'PARTY'));

    socket.on('acceptPK', (payload) => {
        try {
            if (!payload || !payload.targetId) return;
            const battleId = `battle_${Date.now()}`;
            io.to(socket.id).to(payload.targetId).emit('battleStarted', { battleId });
        } catch (err) {}
    });

    socket.on('disconnect', () => {
        try {
            if (players[socket.id]) {
                socket.to(`map_${players[socket.id].mapId}`).emit('playerLeft', socket.id);
                delete players[socket.id];
                console.log(`[-] Client disconnected: ${socket.id}`);
            }
        } catch (err) {}
    });
});

function handleRequest(socket, payload, type) {
    if (!payload || !payload.targetId) return;
    if (!players[payload.targetId]) return;
    io.to(payload.targetId).emit('receiveRequest', {
        type: type, targetId: payload.targetId, fromId: socket.id, fromName: payload.fromName
    });
}

server.listen(process.env.PORT || 3000, () => console.log(`Server is running!`));
