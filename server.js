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
    console.log(`[+] Đã kết nối Client: ${socket.id}`);

    socket.on('login', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name, mapId: data.mapId,
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
    // TRACKING SỰ KIỆN GỬI YÊU CẦU
    // =====================================
    socket.on('inviteParty', (data) => {
        console.log(`\n[Server] Nhận lệnh 'inviteParty' từ: ${socket.id}`);
        console.log(`[Server] Dữ liệu gói tin:`, data);
        
        if (!players[socket.id]) {
            console.log(`[Server] Lỗi: Người gửi không tồn tại trong bộ nhớ!`);
            return;
        }

        const targetId = typeof data === 'object' ? data.targetId : data;
        
        if (players[targetId]) {
            console.log(`[Server] BẮN TÍN HIỆU THÀNH CÔNG sang Client: ${targetId}`);
            io.to(targetId).emit('inviteParty', { 
                fromId: socket.id, 
                fromName: players[socket.id].name 
            });
        } else {
            console.log(`[Server] THẤT BẠI: Người chơi mục tiêu (${targetId}) đã offline hoặc không tồn tại.`);
        }
    });

    socket.on('acceptParty', (data) => {
        console.log(`[Server] Lời mời được chấp nhận! Data:`, data);
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
            console.log(`[Server] Đã tạo/thêm vào Party ID: ${partyId}`);
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            socket.to(`map_${players[socket.id].mapId}`).emit('playerLeft', socket.id);
            delete players[socket.id];
        }
        console.log(`[-] Đã ngắt kết nối: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => { console.log(`[V] MMO Server đang chạy trên cổng ${PORT}`); });
