const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

// Simple and robust WebSocket server for Railway
console.log("🚀 Starting Yjs WebSocket server...");

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

// Create HTTP server first
const server = http.createServer((req, res) => {
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
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        port: PORT,
        uptime: process.uptime(),
      })
    );
    return;
  }

  // Default response
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Yjs WebSocket Server</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .status { color: green; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>🚀 Yjs WebSocket Server</h1>
      <p class="status">✅ Server is running!</p>
      <p>Port: ${PORT}</p>
      <p>WebSocket URL: wss://${req.headers.host || `localhost:${PORT}`}</p>
      <p>Health: <a href="/health">/health</a></p>
    </body>
    </html>
  `);
});

// Create WebSocket server
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    console.log("🔍 New WebSocket connection attempt");
    return true;
  },
});

let connectionCount = 0;

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  connectionCount++;
  console.log(`✅ WebSocket connected (Total: ${connectionCount})`);
  console.log(`📡 Origin: ${req.headers.origin}`);
  console.log(`🔗 URL: ${req.url}`);

  try {
    // Import setupWSConnection here to avoid early import issues
    const { setupWSConnection } = require("y-websocket/bin/utils");

    // Setup Yjs connection
    setupWSConnection(ws, req, {
      gc: true,
    });

    console.log("🔄 Yjs connection setup successful");
  } catch (error) {
    console.error("❌ Error setting up Yjs connection:", error);
    ws.close(1011, "Setup failed");
    connectionCount--;
    return;
  }

  // Handle close
  ws.on("close", (code, reason) => {
    connectionCount--;
    console.log(
      `❌ WebSocket closed: ${code} - ${reason} (Total: ${connectionCount})`
    );
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
    connectionCount--;
  });

  // Send welcome message
  try {
    ws.send(
      JSON.stringify({
        type: "server-welcome",
        message: "Connected to Yjs server",
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Error sending welcome:", error);
  }
});

// Handle WebSocket server errors
wss.on("error", (error) => {
  console.error("❌ WebSocket Server error:", error);
});

// Start server
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server started successfully!`);
  console.log(`📡 HTTP: http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket: ws://${HOST}:${PORT}`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
});

// Handle server errors
server.on("error", (error) => {
  console.error("❌ Server error:", error);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\n🛑 Shutting down...");

  wss.clients.forEach((ws) => {
    try {
      ws.close(1001, "Server shutdown");
    } catch (error) {
      console.error("Error closing WebSocket:", error);
    }
  });

  server.close((error) => {
    if (error) {
      console.error("Error closing server:", error);
      process.exit(1);
    } else {
      console.log("✅ Server closed");
      process.exit(0);
    }
  });
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

console.log("✅ Server setup complete");
