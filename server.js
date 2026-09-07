// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// In-memory Database
const players = {};
const parties = {};
const battles = {};

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // ĐĂNG NHẬP
    socket.on('login', (payload) => {
        try {
            if (!payload) return;
            const { name, mapId, x, y, direction, charName, charIndex, hp, mp } = payload;
            
            players[socket.id] = { 
                id: socket.id, name, mapId, x, y, direction, charName, charIndex, hp, mp 
            };
            
            const roomName = `map_${mapId}`;
            socket.join(roomName);
            
            // Gửi danh sách người chơi hiện có trong map cho người mới
            const mapPlayers = Object.values(players).filter(p => p.mapId === mapId && p.id !== socket.id);
            socket.emit('initMapPlayers', mapPlayers);

            // Báo cho những người cũ trong map có người mới
            socket.to(roomName).emit('playerJoined', players[socket.id]);
        } catch (err) {
            console.error('Error on login:', err);
        }
    });

    // DI CHUYỂN
    socket.on('move', (payload) => {
        try {
            if (!players[socket.id] || !payload) return;
            const player = players[socket.id];
            player.x = payload.x;
            player.y = payload.y;
            player.direction = payload.direction;

            // Broadcast tọa độ cho những người cùng Map (trừ người gửi)
            socket.to(`map_${player.mapId}`).emit('playerMoved', {
                id: socket.id,
                x: payload.x,
                y: payload.y,
                direction: payload.direction
            });
        } catch (err) {
            console.error('Error on move:', err);
        }
    });

    // CHUYỂN MAP
    socket.on('changeMap', (payload) => {
        try {
            if (!players[socket.id] || !payload || !payload.mapId) return;
            const player = players[socket.id];
            
            socket.leave(`map_${player.mapId}`);
            socket.to(`map_${player.mapId}`).emit('playerLeft', socket.id); // Báo map cũ
            
            player.mapId = payload.mapId;
            socket.join(`map_${player.mapId}`);
            socket.to(`map_${player.mapId}`).emit('playerJoined', player); // Báo map mới
        } catch (err) {
            console.error('Error on map change:', err);
        }
    });

    // TƯƠNG TÁC: PK & TỔ ĐỘI
    socket.on('pkRequest', (payload) => handleInteractionRequest(socket, payload, 'PK'));
    socket.on('inviteParty', (payload) => handleInteractionRequest(socket, payload, 'PARTY'));

    // PHẢN HỒI: CHẤP NHẬN PK / TỔ ĐỘI
    socket.on('acceptPK', (payload) => {
        try {
            if (!payload || !payload.targetId) return;
            const p1 = players[socket.id];
            const p2 = players[payload.targetId]; // Người mời
            
            if (!p1 || !p2) return;
            
            const battleId = `battle_${Date.now()}`;
            battles[battleId] = { teamA: [p1.id], teamB: [p2.id] };
            
            io.to(p1.id).to(p2.id).emit('battleStarted', { battleId, type: 'PvP' });
        } catch (err) {
            console.error('Error on acceptPK:', err);
        }
    });

    // GỌI HỖ TRỢ TRONG BATTLE
    socket.on('backupRequest', (payload) => {
        try {
            if (!players[socket.id] || !payload || !payload.battleId) return;
            const player = players[socket.id];
            
            // Broadcast cho tất cả trong map
            socket.to(`map_${player.mapId}`).emit('backupRequested', {
                fromId: socket.id,
                fromName: player.name,
                battleId: payload.battleId
            });
        } catch (err) {
             console.error('Error on backup request:', err);
        }
    });

    // NGẮT KẾT NỐI
    socket.on('disconnect', () => {
        try {
            if (players[socket.id]) {
                const mapId = players[socket.id].mapId;
                socket.to(`map_${mapId}`).emit('playerLeft', socket.id);
                delete players[socket.id];
                console.log(`[-] Client disconnected: ${socket.id}`);
            }
        } catch (err) {
            console.error('Error on disconnect:', err);
        }
    });
});

// Hàm hỗ trợ định tuyến tương tác
function handleInteractionRequest(socket, payload, type) {
    try {
        if (!payload || !payload.targetId || !payload.fromId) return;
        const target = players[payload.targetId];
        if (!target) return; // Người nhận không tồn tại/đã offline

        // Forward tới đích
        io.to(payload.targetId).emit('receiveRequest', {
            type: type,
            targetId: payload.targetId,
            fromId: payload.fromId,
            fromName: payload.fromName
        });
    } catch (err) {
        console.error(`Error on ${type} request:`, err);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
