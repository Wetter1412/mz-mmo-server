const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const players = {}; 
const parties = {};
const battles = {};

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    socket.on('login', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            mapId: data.mapId,
            x: data.x, y: data.y, dir: data.dir,
            charName: data.charName, charIndex: data.charIndex,
            partyId: null, hp: data.hp, mp: data.mp, maxHp: data.maxHp
        };
        socket.join(`map_${data.mapId}`);
        const mapPlayers = Object.values(players).filter(p => p.mapId === data.mapId && p.id !== socket.id);
        socket.emit('mapData', mapPlayers);
        socket.to(`map_${data.mapId}`).emit('playerJoined', players[socket.id]);
    });

    socket.on('move', (data) => {
        if (!players[socket.id]) return;
        const p = players[socket.id];
        if (p.mapId !== data.mapId) {
            socket.leave(`map_${p.mapId}`);
            socket.to(`map_${p.mapId}`).emit('playerLeft', socket.id);
            p.mapId = data.mapId;
            socket.join(`map_${p.mapId}`);
            socket.to(`map_${p.mapId}`).emit('playerJoined', p);
        }
        p.x = data.x; p.y = data.y; p.dir = data.dir;
        socket.to(`map_${p.mapId}`).emit('playerMoved', { id: socket.id, x: p.x, y: p.y, dir: p.dir });
    });

    // =====================================
    // SỬA LỖI TỔ ĐỘI / PK 
    // =====================================
    socket.on('inviteParty', (data) => {
        if (!players[socket.id]) return; // Chống sập server nếu client lỗi

        // Nhận diện linh hoạt cả khi client gửi Object mới lẫn String cũ
        const targetId = typeof data === 'object' ? data.targetId : data;
        
        if (players[targetId]) {
            io.to(targetId).emit('inviteParty', { 
                fromId: socket.id, 
                fromName: players[socket.id].name 
            });
        }
    });

    socket.on('acceptParty', (data) => {
        if (!players[socket.id]) return;
        
        const requesterId = typeof data === 'object' ? data.targetId : data; 
        if (!players[requesterId]) return;
        
        let partyId = players[requesterId].partyId;
        if (!partyId) {
            partyId = `party_${requesterId}`;
            parties[partyId] = [requesterId];
            players[requesterId].partyId = partyId;
        }
        
        if (parties[partyId].length < 4) {
            parties[partyId].push(socket.id);
            players[socket.id].partyId = partyId;
            io.to(partyId).emit('partyUpdated', parties[partyId].map(id => players[id]));
            socket.join(partyId);
            const reqSocket = io.sockets.sockets.get(requesterId);
            if(reqSocket) reqSocket.join(partyId);
        }
    });

    socket.on('pkRequest', (data) => {
        if (!players[socket.id]) return;
        const targetId = typeof data === 'object' ? data.targetId : data;
        
        if (players[targetId]) {
            io.to(targetId).emit('pkRequest', { 
                fromId: socket.id, 
                fromName: players[socket.id].name 
            });
        }
    });

    socket.on('acceptPK', (data) => {
        if (!players[socket.id]) return;
        const challengerId = typeof data === 'object' ? data.targetId : data; 
        
        const roomId = `battle_${challengerId}_${socket.id}`;
        battles[roomId] = { teamA: [challengerId], teamB: [socket.id], state: 'waiting' };
        
        socket.join(roomId);
        const challengerSocket = io.sockets.sockets.get(challengerId);
        if(challengerSocket) challengerSocket.join(roomId);

        io.to(roomId).emit('battleStarted', { roomId, teamA: [players[challengerId]], teamB: [players[socket.id]] });
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            socket.to(`map_${players[socket.id].mapId}`).emit('playerLeft', socket.id);
            delete players[socket.id];
        }
        console.log(`[-] Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => { console.log(`[V] MMO Server is running on port ${PORT}`); });
