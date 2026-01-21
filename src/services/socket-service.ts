import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";

let io: SocketIOServer;
const userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket ids
const companyUsers: Map<string, Set<string>> = new Map(); // companyId -> Set of user ids

export async function initializeSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ADMIN_URL || "http://localhost:4200",
      credentials: true,
    },
  });

  // Socket connection handling
  io.on("connection", (socket: Socket) => {
    console.log("✓ User connected via Socket.io:", socket.id);

    // When user joins (after login)
    socket.on("user:join", (data: { userId: string; companyId: string }) => {
      const { userId, companyId } = data;

      // Track user's sockets
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);

      // Track company's users
      if (!companyUsers.has(companyId)) {
        companyUsers.set(companyId, new Set());
      }
      companyUsers.get(companyId)!.add(userId);

      // Join socket to company room for broadcasting
      socket.join(`company:${companyId}`);

      console.log(
        `✓ User ${userId} joined company ${companyId} (Socket: ${socket.id})`
      );
    });

    // Handle user leaving
    socket.on("user:leave", (data: { userId: string; companyId: string }) => {
      const { userId, companyId } = data;
      socket.leave(`company:${companyId}`);
      console.log(
        `✓ User ${userId} left company ${companyId} (Socket: ${socket.id})`
      );
    });

    // When user disconnects
    socket.on("disconnect", () => {
      console.log("✗ User disconnected:", socket.id);

      // Remove socket from user tracking
      for (const [userId, sockets] of userSockets.entries()) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          // Also remove from company users
          for (const [companyId, users] of companyUsers.entries()) {
            users.delete(userId);
            if (users.size === 0) {
              companyUsers.delete(companyId);
            }
          }
        }
      }
    });
  });

  console.log("✓ Socket.io initialized");
  return io;
}

/**
 * Notify all users in a company about a new social media connection
 * Works for Drive, YouTube, Facebook, LinkedIn, Twitter, TikTok, Pinterest, Gmail, etc.
 */
export function notifySocialConnectionAdded(
  companyId: string,
  connectionData: {
    provider: string; // 'google-drive', 'youtube', 'facebook', 'linkedin', 'twitter', 'tiktok', 'pinterest', 'gmail', etc.
    accountEmail?: string;
    accountId?: string;
    accountName?: string;
  }
) {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  const event = `social:connected`;
  const payload = {
    success: true,
    type: "connection_added",
    provider: connectionData.provider,
    accountEmail: connectionData.accountEmail || null,
    accountId: connectionData.accountId || null,
    accountName: connectionData.accountName || null,
    message: `${connectionData.provider} account connected by admin`,
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit(event, payload);

  console.log(
    `✓ Broadcast to company ${companyId}: ${connectionData.provider} connected`
  );
}

/**
 * Notify about social media disconnection
 */
export function notifySocialConnectionRemoved(
  companyId: string,
  provider: string,
  accountEmail?: string
) {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  const event = `social:disconnected`;
  const payload = {
    success: true,
    type: "connection_removed",
    provider,
    accountEmail: accountEmail || null,
    message: `${provider} account disconnected by admin`,
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit(event, payload);

  console.log(
    `✓ Broadcast to company ${companyId}: ${provider} disconnected`
  );
}

/**
 * Notify about connection status update
 */
export function notifySocialConnectionUpdated(
  companyId: string,
  provider: string,
  updates: Record<string, any>
) {
  if (!io) {
    console.warn("Socket.io not initialized");
    return;
  }

  const event = `social:updated`;
  const payload = {
    success: true,
    type: "connection_updated",
    provider,
    updates,
    timestamp: new Date().toISOString(),
  };

  io.to(`company:${companyId}`).emit(event, payload);

  console.log(`✓ Broadcast to company ${companyId}: ${provider} updated`);
}

export function getIO() {
  return io;
}

export function getUserSockets(userId: string): string[] {
  return Array.from(userSockets.get(userId) || []);
}

export function getCompanyUsers(companyId: string): string[] {
  return Array.from(companyUsers.get(companyId) || []);
}
