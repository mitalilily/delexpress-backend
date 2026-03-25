"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = exports.initSocketServer = void 0;
const socket_io_1 = require("socket.io");
const employee_service_1 = require("../models/services/employee.service");
let io;
// Track active connections per user (supports multiple tabs)
const activeConnections = {};
const initSocketServer = (server) => {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: '*', // Replace with frontend URL in production
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });
    io.on('connection', (socket) => {
        let currentUserId = null;
        socket.on('register', async (userId) => {
            currentUserId = userId;
            socket.join(userId);
            console.log(`User ${userId} joined room`);
            // Track connections per user
            if (!activeConnections[userId])
                activeConnections[userId] = new Set();
            activeConnections[userId].add(socket.id);
            console.log('active connections', userId, activeConnections[userId].size);
            // Mark employee online
            await (0, employee_service_1.setEmployeeOnlineStatus)(userId, true);
            // Handle heartbeat ping
            socket.on('employee_ping', () => {
                console.log(`Ping received from ${userId}`);
                // Optionally update lastSeen in DB here
            });
        });
        socket.on('disconnect', async () => {
            if (currentUserId && activeConnections[currentUserId]) {
                activeConnections[currentUserId].delete(socket.id);
                if (activeConnections[currentUserId].size === 0) {
                    await (0, employee_service_1.setEmployeeOnlineStatus)(currentUserId, false);
                    delete activeConnections[currentUserId];
                }
            }
        });
    });
};
exports.initSocketServer = initSocketServer;
// Emit notification to a specific user
const sendNotification = (userId, notification) => {
    if (io)
        io.to(userId).emit('new_notification', notification);
};
exports.sendNotification = sendNotification;
