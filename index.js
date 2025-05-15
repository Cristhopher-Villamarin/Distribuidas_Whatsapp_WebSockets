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
    pingTimeout: 30000, // Reducido para limpiar conexiones más rápido
});

// Almacenamiento de salas, sockets e IPs
const rooms = new Map(); // Map<PIN, { limit: number, users: Set<string>, creator: string }>
const socketRooms = new Map(); // Map<socket.id, pin>
const clientIps = new Map(); // Map<clientIp, socket.id>

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
    // Obtener IP del cliente
    let clientIp = socket.handshake.address.replace('::ffff:', '');
    if (clientIp === '127.0.0.1' || clientIp === '::1') {
        clientIp = localIPs[0] || clientIp;
    }
    console.log(`Usuario conectado con ID: ${socket.id}, IP: ${clientIp}`);

    // Verificar si la IP ya está conectada
    if (clientIps.has(clientIp)) {
        const existingSocketId = clientIps.get(clientIp);
        console.log(`IP ${clientIp} ya está conectada con socket ${existingSocketId}`);
        socket.emit('connection_error', { error: 'Este dispositivo ya está conectado a una sala. Cierra la otra sesión primero.' });
        socket.disconnect(true);
        return;
    }

    // Registrar la IP del cliente
    clientIps.set(clientIp, socket.id);

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
        // Verificar IP nuevamente para evitar condiciones de carrera
        if (clientIps.get(clientIp) !== socket.id) {
            callback({ success: false, error: 'Este dispositivo ya está conectado a otra sala.' });
            socket.disconnect(true);
            return;
        }
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
        // Verificar IP nuevamente
        if (clientIps.get(clientIp) !== socket.id) {
            callback({ success: false, error: 'Este dispositivo ya está conectado a otra sala.' });
            socket.disconnect(true);
            return;
        }
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
        console.log(`Usuario con ID ${socket.id} desconectado, IP: ${clientIp}`);
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
        // Eliminar la IP del registro
        if (clientIps.get(clientIp) === socket.id) {
            clientIps.delete(clientIp);
        }
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});