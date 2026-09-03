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

// Cơ sở dữ liệu In-memory
const players = {}; 
const parties = {};
const battles = {};

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // 1. ĐĂNG NHẬP & ĐỒNG BỘ MAP
    socket.on('login', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            mapId: data.mapId,
            x: data.x,
            y: data.y,
            dir: data.dir,
            charName: data.charName,
            charIndex: data.charIndex,
            partyId: null,
            hp: data.hp,
            mp: data.mp,
            maxHp: data.maxHp
        };
        socket.join(`map_${data.mapId}`);
        
        // Gửi danh sách người chơi hiện tại trong map cho client mới
        const mapPlayers = Object.values(players).filter(p => p.mapId === data.mapId && p.id !== socket.id);
        socket.emit('mapData', mapPlayers);
        
        // Báo cho những người khác có người mới vào
        socket.to(`map_${data.mapId}`).emit('playerJoined', players[socket.id]);
    });

    socket.on('move', (data) => {
        if (!players[socket.id]) return;
        const p = players[socket.id];
        // Cập nhật map nếu chuyển map
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

    // 2. HỆ THỐNG TỔ ĐỘI (PARTY)
    socket.on('inviteParty', (targetId) => {
        if (players[targetId]) io.to(targetId).emit('partyInviteRequest', { fromId: socket.id, fromName: players[socket.id].name });
    });

    socket.on('acceptParty', (fromId) => {
        if (!players[fromId] || !players[socket.id]) return;
        let partyId = players[fromId].partyId;
        if (!partyId) {
            partyId = `party_${fromId}`;
            parties[partyId] = [fromId];
            players[fromId].partyId = partyId;
        }
        if (parties[partyId].length < 4) {
            parties[partyId].push(socket.id);
            players[socket.id].partyId = partyId;
            io.to(partyId).emit('partyUpdated', parties[partyId].map(id => players[id]));
            socket.join(partyId);
            if(players[fromId]) io.sockets.sockets.get(fromId).join(partyId);
        }
    });

    // 3. HỆ THỐNG PVP & CẦU CỨU
    socket.on('requestPK', (targetId) => {
        if (!players[targetId]) return;
        io.to(targetId).emit('pkRequest', { fromId: socket.id, fromName: players[socket.id].name });
    });

    socket.on('acceptPK', (challengerId) => {
        const roomId = `battle_${challengerId}_${socket.id}`;
        battles[roomId] = { teamA: [challengerId], teamB: [socket.id], state: 'waiting' };
        
        socket.join(roomId);
        const challengerSocket = io.sockets.sockets.get(challengerId);
        if(challengerSocket) challengerSocket.join(roomId);

        io.to(roomId).emit('battleStarted', { roomId, teamA: [players[challengerId]], teamB: [players[socket.id]] });
    });

    socket.on('callBackup', (roomId) => {
        const p = players[socket.id];
        socket.to(`map_${p.mapId}`).emit('backupRequested', { fromId: socket.id, fromName: p.name, roomId });
    });

    socket.on('joinBackup', (data) => {
        const battle = battles[data.roomId];
        if (!battle) return;
        // Logic thêm vào teamA hoặc teamB tùy thuộc vào đồng minh (tạm mặc định team phe gọi)
        // ... (Cần xác định phe dựa vào fromId)
        socket.join(data.roomId);
        io.to(data.roomId).emit('backupArrived', players[socket.id]);
    });

    // Đồng bộ lệnh Combat (Skill, Target)
    socket.on('battleAction', (data) => {
        socket.to(data.roomId).emit('executeAction', data);
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            socket.to(`map_${players[socket.id].mapId}`).emit('playerLeft', socket.id);
            delete players[socket.id];
        }
        console.log(`[-] Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[V] MMO Server is running on port ${PORT}`);
});
