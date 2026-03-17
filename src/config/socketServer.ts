import { Server as HttpServer } from 'http'
import { Socket, Server as SocketIOServer } from 'socket.io'
import { setEmployeeOnlineStatus } from '../models/services/employee.service'

let io: SocketIOServer

// Track active connections per user (supports multiple tabs)
const activeConnections: Record<string, Set<string>> = {}

export const initSocketServer = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Replace with frontend URL in production
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  })

  io.on('connection', (socket: Socket) => {
    let currentUserId: string | null = null

    socket.on('register', async (userId: string) => {
      currentUserId = userId
      socket.join(userId)
      console.log(`User ${userId} joined room`)

      // Track connections per user
      if (!activeConnections[userId]) activeConnections[userId] = new Set()
      activeConnections[userId].add(socket.id)
      console.log('active connections', userId, activeConnections[userId].size)

      // Mark employee online
      await setEmployeeOnlineStatus(userId, true)

      // Handle heartbeat ping
      socket.on('employee_ping', () => {
        console.log(`Ping received from ${userId}`)
        // Optionally update lastSeen in DB here
      })
    })

    socket.on('disconnect', async () => {
      if (currentUserId && activeConnections[currentUserId]) {
        activeConnections[currentUserId].delete(socket.id)

        if (activeConnections[currentUserId].size === 0) {
          await setEmployeeOnlineStatus(currentUserId, false)
          delete activeConnections[currentUserId]
        }
      }
    })
  })
}

// Emit notification to a specific user
export const sendNotification = (userId: string, notification: any) => {
  if (io) io.to(userId).emit('new_notification', notification)
}
