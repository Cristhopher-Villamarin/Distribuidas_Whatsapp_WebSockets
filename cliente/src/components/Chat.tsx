import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './Chat.css';

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></link>
const SOCKET_SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

interface Message {
    autor: string;
    message: string;
}

interface HostInfo {
    ip: string;
    hostname: string;
}

export const Chat: React.FC = () => {
    const [nickname, setNickname] = useState<string>('');
    const [tempNickname, setTempNickname] = useState<string>('');
    const [roomPin, setRoomPin] = useState<string>('');
    const [joinPin, setJoinPin] = useState<string>('');
    const [showCreateRoom, setShowCreateRoom] = useState<boolean>(false);
    const [participantLimit, setParticipantLimit] = useState<string>('5');
    const [connected, setConnected] = useState<boolean>(false);
    const [message, setMessage] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
    const [userCount, setUserCount] = useState<number>(0);
    const [roomLimit, setRoomLimit] = useState<number>(0);
    const [error, setError] = useState<string>('');
    const [connectionError, setConnectionError] = useState<string>('');

    const socketRef = useRef<any>(null);
    const messageContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messageContainerRef.current) {
            messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
    if (!nickname) return;

    console.log("Intentando conectar a:", SOCKET_SERVER_URL);
    socketRef.current = io(SOCKET_SERVER_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
    });

    socketRef.current.on('connect', () => {
        console.log("Conectado al servidor Socket.IO");
        setConnected(true);
        setConnectionError('');
    });

    socketRef.current.on('connect_error', (error: any) => {
        console.error("Error de conexión:", error);
        setConnectionError(`Error de conexión: ${error.message}`);
        setConnected(false);
    });

    socketRef.current.on('connection_error', (data: { error: string }) => {
        console.error("Error de conexión por IP:", data.error);
        setConnectionError(data.error);
        setConnected(false);
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

    socketRef.current.on('host_info', (data: HostInfo) => {
        console.log("Información del host recibida:", data);
        setHostInfo(data);
    });

    socketRef.current.on('receive_message', (data: Message) => {
        console.log("Mensaje recibido:", data);
        if (data.autor !== nickname) {
            setMessages((prev: Message[]) => [...prev, data]);
        }
    });

    socketRef.current.on('user_count', ({ count, limit }: { count: number, limit: number }) => {
        setUserCount(count);
        setRoomLimit(limit);
    });

    socketRef.current.on('room_created', ({ pin, limit }: { pin: string, limit: number }) => {
        setRoomPin(pin);
        setRoomLimit(limit);
        localStorage.setItem('currentRoom', pin);
    });

    return () => {
        console.log("Desconectando socket");
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
    };
}, [nickname]);


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

    const createRoom = () => {
        const limit = parseInt(participantLimit);
        if (isNaN(limit) || limit < 1 || limit > 50) {
            setError('Límite inválido (1-50)');
            return;
        }
        if (!socketRef.current) return;
        socketRef.current.emit('create_room', { limit }, (response: any) => {
            if (response.success) {
                setShowCreateRoom(false);
                setError('');
            } else {
                setError(response.error);
            }
        });
    };

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
        setMessages((prev: Message[]) => [...prev, msg]);
        setMessage('');
        setError('');
    };

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

    if (!roomPin) {
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
                                        if (/^\d*$/.test(value)) {
                                            setParticipantLimit(value);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                                                            
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