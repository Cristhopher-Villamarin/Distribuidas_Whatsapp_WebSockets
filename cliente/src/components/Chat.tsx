import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
// Importación de estilos de PrimeReact
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './Chat.css';

// URL del servidor Socket.IO (toma variable de entorno o localhost)
const SOCKET_SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

// Definición de interfaces para tipar mensajes y datos del host
interface Message {
    autor: string;
    message: string;
}

interface HostInfo {
    ip: string;
    hostname: string;
}

export const Chat: React.FC = () => {
    // Estados para manejar información del usuario, salas, mensajes, etc.
    const [nickname, setNickname] = useState<string>(''); // Nickname confirmado
    const [tempNickname, setTempNickname] = useState<string>(''); // Nickname temporal para input
    const [roomPin, setRoomPin] = useState<string>(''); // PIN de sala activa
    const [joinPin, setJoinPin] = useState<string>(''); // PIN para unirse a una sala
    const [showCreateRoom, setShowCreateRoom] = useState<boolean>(false); // Mostrar formulario crear sala
    const [participantLimit, setParticipantLimit] = useState<string>('5'); // Límite participantes en creación sala
    const [connected, setConnected] = useState<boolean>(false); // Estado conexión socket
    const [message, setMessage] = useState<string>(''); // Mensaje a enviar
    const [messages, setMessages] = useState<Message[]>([]); // Lista de mensajes en chat
    const [hostInfo, setHostInfo] = useState<HostInfo | null>(null); // Info del host (ip y hostname)
    const [userCount, setUserCount] = useState<number>(0); // Número usuarios en sala
    const [roomLimit, setRoomLimit] = useState<number>(0); // Límite usuarios de la sala
    const [error, setError] = useState<string>(''); // Mensajes de error varios
    const [connectionError, setConnectionError] = useState<string>(''); // Error conexión socket

    // Referencia para controlar el socket y el contenedor de mensajes
    const socketRef = useRef<any>(null);
    const messageContainerRef = useRef<HTMLDivElement>(null);

    // Efecto para autoscroll hacia el último mensaje cuando cambia la lista de mensajes
    useEffect(() => {
        if (messageContainerRef.current) {
            messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Efecto principal para conectar el socket cuando se establece un nickname
    useEffect(() => {
        if (!nickname) return; // No conectar si no hay nickname

        console.log("Intentando conectar a:", SOCKET_SERVER_URL);
        // Crear la conexión Socket.IO
        socketRef.current = io(SOCKET_SERVER_URL, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
        });

        // Cuando se conecta exitosamente
        socketRef.current.on('connect', () => {
            console.log("Conectado al servidor Socket.IO");
            setConnected(true);
            setConnectionError('');
        });

        // Manejar errores de conexión
        socketRef.current.on('connect_error', (error: any) => {
            console.error("Error de conexión:", error);
            setConnectionError(`Error de conexión: ${error.message}`);
            setConnected(false);
        });

        // Error específico cuando IP está bloqueada o no autorizada
        socketRef.current.on('connection_error', (data: { error: string }) => {
            console.error("Error de conexión por IP:", data.error);
            setConnectionError(data.error);
            setConnected(false);
            // Resetear estados para limpiar UI
            setNickname('');
            setRoomPin('');
            setMessages([]);
            setUserCount(0);
            setRoomLimit(0);
            localStorage.removeItem('currentRoom');
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        });

        // Recibir información del host (IP, hostname)
        socketRef.current.on('host_info', (data: HostInfo) => {
            console.log("Información del host recibida:", data);
            setHostInfo(data);
        });

        // Recibir un mensaje enviado por otros usuarios
        socketRef.current.on('receive_message', (data: Message) => {
            console.log("Mensaje recibido:", data);
            // Solo añadir mensaje si no es del propio usuario (para evitar duplicados)
            if (data.autor !== nickname) {
                setMessages((prev: Message[]) => [...prev, data]);
            }
        });

        // Actualizar número de usuarios y límite de sala
        socketRef.current.on('user_count', ({ count, limit }: { count: number, limit: number }) => {
            setUserCount(count);
            setRoomLimit(limit);
        });

        // Recibir confirmación de sala creada con su PIN y límite
        socketRef.current.on('room_created', ({ pin, limit }: { pin: string, limit: number }) => {
            setRoomPin(pin);
            setRoomLimit(limit);
            localStorage.setItem('currentRoom', pin);
        });

        // Limpieza: desconectar socket al desmontar o cambiar nickname
        return () => {
            console.log("Desconectando socket");
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [nickname]);


    // Función para validar y confirmar el nickname ingresado
    const handleNickname = () => {
        const nick = tempNickname.trim();
        if (!nick) {
            setError('El nickname no puede estar vacío');
            return;
        }
        setNickname(nick);
        setTempNickname('');
        setError('');
        setConnectionError(''); 
    };

    // Función para crear una sala con límite de participantes
    const createRoom = () => {
        const limit = parseInt(participantLimit);
        if (isNaN(limit) || limit < 1 || limit > 50) {
            setError('Límite inválido (1-50)');
            return;
        }
        if (!socketRef.current) return;
        // Emitir evento para crear sala y manejar respuesta
        socketRef.current.emit('create_room', { limit }, (response: any) => {
            if (response.success) {
                setShowCreateRoom(false);
                setError('');
            } else {
                setError(response.error);
            }
        });
    };

    // Función para unirse a una sala existente por PIN
    const joinRoom = () => {
        if (!joinPin.match(/^\d{6}$/)) {
            setError('El PIN debe ser de 6 dígitos');
            return;
        }
        if (!socketRef.current) return;
        socketRef.current.emit('join_room', { pin: joinPin }, (response: any) => {
            if (response.success) {
                setRoomPin(response.pin);
                localStorage.setItem('currentRoom', response.pin);
                setError('');
            } else {
                setError(response.error);
            }
        });
    };

    // Función para enviar un mensaje a la sala
    const sendMessage = () => {
        if (!message.trim() || !connected || !socketRef.current) {
            setError('No se puede enviar el mensaje');
            return;
        }
        const msg: Message = {
            autor: nickname,
            message: message.trim(),
        };
        socketRef.current.emit('send_message', msg);
        setMessages((prev: Message[]) => [...prev, msg]); // Añadir mensaje propio a la lista
        setMessage('');
        setError('');
    };

    // Función para abandonar la sala y desconectar el socket
    const leaveRoom = () => {
        localStorage.removeItem('currentRoom');
        setRoomPin('');
        setMessages([]);
        setUserCount(0);
        setRoomLimit(0);
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        setConnected(false);
        setNickname('');
        setConnectionError('');
    };

    // Renderizado condicional según estado del usuario y sala

    // Si no hay nickname, mostrar formulario para ingresar usuario
    if (!nickname) {
        return (
            <div className="app">
                <Card title="Bienvenido al Chat">
                    <div className="p-card-content">
                        {connectionError && <div className="error-message">{connectionError}</div>}
                        <div className="p-fluid">
                            <div className="p-field p-mb-3">
                                <label htmlFor="txtNickname">Ingrese su usuario:</label>
                                <InputText
                                    id="txtNickname"
                                    value={tempNickname}
                                    onChange={(e) => setTempNickname(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleNickname()}
                                    placeholder="Ejm. Jerez123"
                                />
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            <Button
                                label="Ingresar"
                                icon="pi pi-sign-in"
                                onClick={handleNickname}
                            />
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // Si hay nickname pero no está en sala, mostrar opciones de unirse o crear sala
    if (!roomPin) {
        // Mostrar formulario para crear sala si está activo
        if (showCreateRoom) {
            return (
                <div className="app">
                    <Card title="Crear Sala">
                        <div className="p-fluid">
                            <div className="p-field p-mb-3">
                                <label htmlFor="participantLimit">Límite de participantes</label>
                                <InputText
                                    id="participantLimit"
                                    value={participantLimit}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        // Permitir solo números
                                        if (/^\d*$/.test(value)) {
                                            setParticipantLimit(value);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        // Permitir solo números, backspace y enter
                                        if (!/[0-9]/.test(e.key) && e.key !== "Backspace" && e.key !== "Enter") {
                                            e.preventDefault();
                                        }
                                        if (e.key === "Enter") {
                                            createRoom();
                                        }
                                    }}
                                    placeholder="Ejm. 5"
                                    maxLength={2}
                                />
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            <Button label="Crear" icon="pi pi-plus" onClick={createRoom} />
                            <Button
                                label="Cancelar"
                                icon="pi pi-times"
                                onClick={() => setShowCreateRoom(false)}
                                className="p-button-secondary"
                            />
                        </div>
                    </Card>
                </div>
            );
        }

        // Mostrar formulario para unirse a sala con PIN
        return (
            <div className="app">
                <Card title="Unirse a una Sala">
                    <div className="p-fluid">
                        <div className="p-field p-mb-3">
                            <label htmlFor="joinPin">PIN de la sala</label>
                            <InputText
                                id="joinPin"
                                value={joinPin}
                                onChange={(e) => setJoinPin(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        joinRoom();
                                    }
                                    // Permitir solo números, backspace y enter
                                    if (!/[0-9]/.test(e.key) && e.key !== "Backspace" && e.key !== "Enter") {
                                        e.preventDefault();
                                    }
                                }}
                                placeholder="Ejm. 123456"
                                maxLength={6}
                            />
                        </div>
                        {error && <div className="error-message">{error}</div>}
                        <Button label="Unirse" icon="pi pi-sign-in" onClick={joinRoom} />
                        <Button
                            label="Crear Sala"
                            icon="pi pi-plus"
                            onClick={() => setShowCreateRoom(true)}
                            className="p-button-secondary"
                        />
                    </div>
                </Card>
            </div>
        );
    }

    // Si hay nickname y sala activa, mostrar chat completo
    return (
        <div className="app">
            <Card title={`Chat - Sala ${roomPin}`}>
                <div className="p-card-content">
                    {connectionError && (
                        <div className="error-message">{connectionError}</div>
                    )}
                    <div className="host-info">
                        Conectado desde: <strong>{hostInfo?.hostname || 'Desconocido'}</strong>
                    </div>
                    <div className="room-info">
                        Usuarios: {userCount}/{roomLimit}
                    </div>
                    <div 
                        className="mesg-container"
                        ref={messageContainerRef}
                    >
                        {messages.length === 0 ? (
                            <p className="no-messages">No hay mensajes aún</p>
                        ) : (
                            messages.map((m: Message, i: number) => (
                                <div
                                    key={i}
                                    className={`message ${m.autor === nickname ? 'my-message' : 'other-message'}`}
                                >
                                    <strong>{m.autor}</strong>
                                    <span>{m.message}</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="input-area">
                        <InputTextarea
                            rows={2}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                // Enviar mensaje al presionar Enter (sin Shift)
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="Escribe tu mensaje..."
                        />
                        <Button
                            icon="pi pi-send"
                            onClick={sendMessage}
                            disabled={!connected}
                        />
                    </div>
                    {error && <div className="error-message">{error}</div>}
                    <div className="status">
                        Estado: {connected ? 'Conectado' : 'Desconectado'}
                    </div>
                    <Button
                        label="Abandonar Sala"
                        icon="pi pi-sign-out"
                        onClick={leaveRoom}
                        className="p-button-danger"
                    />
                </div>
            </Card>
        </div>
    );
};
