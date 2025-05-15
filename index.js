require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const dns = require('dns');
const os = require('os');

const app = express();

// Configuración de CORS
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({
    origin: corsOrigin,
    credentials: true
}));

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar Socket.IO
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
});

// Almacenamiento de salas y sockets
const rooms = new Map(); // Map<PIN, { limit: number, users: Set<string>, creator: string }>
const socketRooms = new Map(); // Map<socket.id, pin>

// Generar PIN único de 6 dígitos
function generateUniquePIN() {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms.has(pin));
    return pin;
}

// Obtener IPs locales para depuración
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const networkInterfaceName in interfaces) {
        const networkInterface = interfaces[networkInterfaceName];
        for (const networkAddress of networkInterface) {
            if (networkAddress.family === 'IPv4' && !networkAddress.internal) {
                addresses.push(networkAddress.address);
            }
        }
    }
    return addresses;
}

const localIPs = getLocalIPs();
console.log('IPs locales del servidor:', localIPs);

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Servidor de chat funcionando correctamente');
});

// Manejo de conexiones Socket.IO
io.on('connection', (socket) => {
    console.log(`Usuario conectado con ID: ${socket.id}`);

    // Obtener IP del cliente
    let clientIp = socket.handshake.address.replace('::ffff:', '');
    if (clientIp === '127.0.0.1' || clientIp === '::1') {
        clientIp = localIPs[0] || clientIp;
    }
    console.log('IP del cliente:', clientIp);

    // Enviar información del host
    try {
        if (clientIp === '127.0.0.1' || clientIp === '::1') {
            socket.emit('host_info', { 
                ip: clientIp, 
                hostname: os.hostname() || 'localhost' 
            });
        } else {
            dns.reverse(clientIp, (err, hostnames) => {
                const hostname = err ? (os.hostname() || clientIp) : hostnames[0];
                socket.emit('host_info', { ip: clientIp, hostname });
            });
        }
    } catch (error) {
        console.error('Error al resolver el hostname:', error);
        socket.emit('host_info', { 
            ip: clientIp, 
            hostname: os.hostname() || 'unknown-host' 
        });
    }

    // Crear sala
    socket.on('create_room', ({ limit }, callback) => {
        if (socketRooms.has(socket.id)) {
            return callback({ success: false, error: 'Ya estás en una sala' });
        }
        if (isNaN(limit) || limit < 1 || limit > 50) {
            return callback({ success: false, error: 'Límite inválido (1-50)' });
        }
        const pin = generateUniquePIN();
        rooms.set(pin, { limit, users: new Set([socket.id]), creator: socket.id });
        socketRooms.set(socket.id, pin);
        socket.join(pin);
        io.to(pin).emit('user_count', { count: 1, limit });
        socket.emit('room_created', { pin, limit });
        callback({ success: true, pin });
    });

    // Unirse a sala
    socket.on('join_room', ({ pin }, callback) => {
        if (socketRooms.has(socket.id)) {
            return callback({ success: false, error: 'Ya estás en una sala' });
        }
        if (!rooms.has(pin)) {
            return callback({ success: false, error: 'PIN inválido' });
        }
        const room = rooms.get(pin);
        if (room.users.size >= room.limit) {
            return callback({ success: false, error: 'Sala llena' });
        }
        room.users.add(socket.id);
        socketRooms.set(socket.id, pin);
        socket.join(pin);
        io.to(pin).emit('user_count', { count: room.users.size, limit: room.limit });
        callback({ success: true, pin });
    });

    // Enviar mensaje
    socket.on('send_message', (msg) => {
        if (!msg || typeof msg !== 'object' || !msg.autor || !msg.message) {
            console.error('Formato de mensaje inválido:', msg);
            return;
        }
        const pin = socketRooms.get(socket.id);
        if (pin) {
            io.to(pin).emit('receive_message', msg);
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        console.log(`Usuario con ID ${socket.id} desconectado`);
        const pin = socketRooms.get(socket.id);
        if (pin && rooms.has(pin)) {
            const room = rooms.get(pin);
            room.users.delete(socket.id);
            socketRooms.delete(socket.id);
            io.to(pin).emit('user_count', { count: room.users.size, limit: room.limit });
            if (room.users.size === 0) {
                rooms.delete(pin);
                console.log(`Sala ${pin} eliminada por inactividad`);
            }
        }
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});