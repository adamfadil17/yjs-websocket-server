const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

console.log("🚀 Starting Yjs WebSocket server with room support...");

const PORT = process.env.PORT;
const HOST = process.env.HOST || "0.0.0.0";

// Track active rooms and connections
const rooms = new Map();
let totalConnections = 0;

// Create HTTP server
const server = http.createServer((req, res) => {
  console.log(`📥 HTTP Request: ${req.method} ${req.url}`);

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === "/health") {
    console.log("🏥 Health check requested");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        port: PORT,
        totalConnections,
        activeRooms: rooms.size,
        rooms: Array.from(rooms.entries()).map(([name, count]) => ({
          name,
          connections: count,
        })),
      })
    );
    return;
  }

  // Stats endpoint
  if (req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        totalConnections,
        activeRooms: rooms.size,
        rooms: Array.from(rooms.entries()).map(([name, count]) => ({
          name,
          connections: count,
        })),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      })
    );
    return;
  }

  // Default page
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Yjs WebSocket Server</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        .status { color: green; font-weight: bold; font-size: 18px; }
        .url { background: #e9ecef; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 10px 0; }
        .stats { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Yjs WebSocket Server</h1>
        <p class="status">✅ Server is running!</p>
        
        <h3>🔗 WebSocket URL:</h3>
        <div class="url">wss://${req.headers.host}</div>
        
        <h3>📊 Server Stats:</h3>
        <div class="stats">
          <p><strong>Port:</strong> ${PORT}</p>
          <p><strong>Total Connections:</strong> ${totalConnections}</p>
          <p><strong>Active Rooms:</strong> ${rooms.size}</p>
          <p><strong>Uptime:</strong> ${Math.floor(
            process.uptime()
          )} seconds</p>
        </div>
        
        <h3>🔧 Endpoints:</h3>
        <p><a href="/health" target="_blank">Health Check</a></p>
        <p><a href="/stats" target="_blank">Statistics</a></p>
        
        <h3>📝 Usage:</h3>
        <p>Connect to: <code>wss://${
          req.headers.host
        }?room=your-room-name</code></p>
      </div>
    </body>
    </html>
  `);
});

// Create WebSocket server
console.log("🔌 Creating WebSocket server...");
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    console.log("🔍 WebSocket connection attempt");
    console.log("📡 Origin:", info.origin);
    console.log("🔗 URL:", info.req.url);
    return true;
  },
});

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  totalConnections++;

  // Parse URL to get room name
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomName =
    url.searchParams.get("room") || url.pathname.slice(1) || "default";

  // Track room connections
  const currentRoomCount = rooms.get(roomName) || 0;
  rooms.set(roomName, currentRoomCount + 1);

  console.log(`✅ New WebSocket connection`);
  console.log(`📊 Total connections: ${totalConnections}`);
  console.log(`🏠 Room: "${roomName}" (${rooms.get(roomName)} users)`);
  console.log(`📡 Full URL: ${req.url}`);

  // Store room name on WebSocket for cleanup
  ws.roomName = roomName;

  // Import and setup Yjs connection
  let setupWSConnection;
  try {
    setupWSConnection = require("y-websocket/bin/utils").setupWSConnection;
    console.log("📦 y-websocket utils loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load y-websocket utils:", error);
    ws.close(1011, "Server setup error");
    totalConnections--;
    return;
  }

  // Setup Yjs connection with room support
  try {
    // Create a modified request object with the room name
    const modifiedReq = {
      ...req,
      url: `/${roomName}`, // Set the room as the path
    };

    setupWSConnection(ws, modifiedReq, {
      gc: true,
      gcFilter: () => true,
    });

    console.log(`🔄 Yjs connection established for room: ${roomName}`);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: "server-welcome",
        message: "Connected to Yjs collaboration server",
        room: roomName,
        connectionId: totalConnections,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("❌ Yjs setup failed:", error);
    ws.close(1011, "Yjs setup failed");
    totalConnections--;

    // Update room count on error
    const roomCount = rooms.get(roomName) || 1;
    if (roomCount <= 1) {
      rooms.delete(roomName);
    } else {
      rooms.set(roomName, roomCount - 1);
    }
    return;
  }

  // Handle connection close
  ws.on("close", (code, reason) => {
    totalConnections--;

    // Update room count
    const roomCount = rooms.get(roomName) || 1;
    if (roomCount <= 1) {
      rooms.delete(roomName);
      console.log(`🏠 Room "${roomName}" is now empty and removed`);
    } else {
      rooms.set(roomName, roomCount - 1);
    }

    console.log(`❌ Connection closed: ${code} - ${reason}`);
    console.log(`📊 Total connections: ${totalConnections}`);
    console.log(
      `🏠 Room "${roomName}" now has ${rooms.get(roomName) || 0} users`
    );
  });

  // Handle connection errors
  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
    totalConnections--;

    // Update room count on error
    const roomCount = rooms.get(roomName) || 1;
    if (roomCount <= 1) {
      rooms.delete(roomName);
    } else {
      rooms.set(roomName, roomCount - 1);
    }
  });

  // Handle messages (for debugging)
  ws.on("message", (data) => {
    console.log(
      `📨 Message received in room "${roomName}" (${data.length} bytes)`
    );
  });
});

// Handle WebSocket server errors
wss.on("error", (error) => {
  console.error("❌ WebSocket Server error:", error);
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Yjs WebSocket server started successfully!`);
  console.log(`📡 HTTP: http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket: ws://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`📊 Stats: http://${HOST}:${PORT}/stats`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✅ Ready for connections with room support!`);
});

// Handle server errors
server.on("error", (error) => {
  console.error("❌ Server error:", error);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\n🛑 Shutting down server...");

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    try {
      ws.close(1001, "Server shutting down");
    } catch (error) {
      console.error("Error closing WebSocket:", error);
    }
  });

  // Close the server
  server.close((error) => {
    if (error) {
      console.error("Error closing server:", error);
      process.exit(1);
    } else {
      console.log("✅ Server closed gracefully");
      process.exit(0);
    }
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log("⚠️ Forcing server shutdown...");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});

console.log("✅ Server initialization complete");
