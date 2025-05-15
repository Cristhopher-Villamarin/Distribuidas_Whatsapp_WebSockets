import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import 'primereact/resources/themes/saga-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';

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

    // Scroll al último mensaje
    useEffect(() => {
        if (messageContainerRef.current) {
            messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Verificar sala activa en localStorage
    useEffect(() => {
        const storedRoom = localStorage.getItem('currentRoom');
        if (storedRoom) {
            setRoomPin(storedRoom);
        }
    }, []);

    // Conexión al servidor Socket.IO
    useEffect(() => {
        if (!nickname) return;

        console.log("Intentando conectar a:", SOCKET_SERVER_URL);
        socketRef.current = io(SOCKET_SERVER_URL);

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

        socketRef.current.on('host_info', (data: HostInfo) => {
            console.log("Información del host recibida:", data);
            setHostInfo(data);
        });

        socketRef.current.on('receive_message', (data: Message) => {
            console.log("Mensaje recibido:", data);
            setMessages((prev) => [...prev, data]);
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
            socketRef.current.disconnect();
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
    };

    const createRoom = () => {
        const limit = parseInt(participantLimit);
        if (isNaN(limit) || limit < 1 || limit > 50) {
            setError('Límite inválido (1-50)');
            return;
        }
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
        setMessages((prev) => [...prev, msg]);
        setMessage('');
        setError('');
    };

    const leaveRoom = () => {
        localStorage.removeItem('currentRoom');
        setRoomPin('');
        setMessages([]);
        setUserCount(0);
        setRoomLimit(0);
        socketRef.current.disconnect();
        setConnected(false);
        setNickname('');
    };

    // Pantalla de ingreso de nickname
    if (!nickname) {
        return (
            <div className="app">
                <Card title="Bienvenido al Chat">
                    <div className="p-fluid">
                        <div className="p-field p-mb-3">
                            <label htmlFor="txtNickname">Nickname</label>
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
                </Card>
            </div>
        );
    }

    // Pantalla de crear/unirse a sala
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
                                    onChange={(e) => setParticipantLimit(e.target.value)}
                                    placeholder="Ejm. 5"
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
                                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                                placeholder="Ejm. 123456"
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

    // Pantalla de chat
    return (
        <div className="app">
            <Card title={`Chat - Sala ${roomPin}`}>
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
                        messages.map((m, i) => (
                            <p
                                key={i}
                                className={`message ${m.autor === nickname ? 'my-message' : 'other-message'}`}
                            >
                                <strong>{m.autor}: </strong>
                                {m.message}
                            </p>
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
                        label="Enviar"
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
            </Card>
        </div>
    );
};