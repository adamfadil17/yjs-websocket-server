const WebSocket = require("ws");
const http = require("http");
const { setupWSConnection } = require("y-websocket/bin/utils");
require("dotenv").config();

class YjsWebSocketServer {
  constructor() {
    this.port = process.env.PORT || 3001;
    this.host = process.env.HOST || "0.0.0.0";
    this.maxConnections = Number.parseInt(process.env.MAX_CONNECTIONS) || 1000;
    this.connectionCount = 0;
    this.rooms = new Map(); // Track active rooms

    this.createServer();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  createServer() {
    // Create HTTP server for health checks and basic info
    this.server = http.createServer((req, res) => {
      // Enable CORS for all origins
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "healthy",
            connections: this.connectionCount,
            rooms: this.rooms.size,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (req.url === "/stats") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const roomStats = Array.from(this.rooms.entries()).map(
          ([name, count]) => ({
            room: name,
            connections: count,
          })
        );
        res.end(
          JSON.stringify({
            totalConnections: this.connectionCount,
            totalRooms: this.rooms.size,
            rooms: roomStats,
            maxConnections: this.maxConnections,
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
          <title>Yjs WebSocket Server - Railway</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .status { color: green; font-weight: bold; font-size: 18px; }
            .url { background: #e9ecef; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Yjs WebSocket Server</h1>
            <p class="status">✅ Server is running on Railway!</p>
            
            <h3>🔗 WebSocket URL:</h3>
            <div class="url">wss://${req.headers.host}</div>
            
            <h3>📊 Server Info:</h3>
            <p>Port: ${this.port}</p>
            <p>Environment: ${process.env.NODE_ENV || "development"}</p>
            <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
            <p>y-websocket version: 3.0.0+</p>
            
            <h3>🔧 Health Check:</h3>
            <p><a href="/health" target="_blank">Check Server Health</a></p>
          </div>
        </body>
        </html>
      `);
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({
      server: this.server,
      maxPayload: 1024 * 1024, // 1MB max payload
      perMessageDeflate: false,
      verifyClient: (info) => {
        console.log("🔍 WebSocket connection attempt from:", info.origin);
        return true; // Accept all connections
      },
    });
  }

  setupEventHandlers() {
    this.wss.on("connection", this.handleConnection.bind(this));
    this.server.on("error", this.handleServerError.bind(this));
    this.wss.on("error", this.handleWebSocketServerError.bind(this));

    // Graceful shutdown
    process.on("SIGINT", this.shutdown.bind(this));
    process.on("SIGTERM", this.shutdown.bind(this));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
      this.shutdown();
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Ping clients periodically to keep connections alive
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // Ping every 30 seconds
  }

  handleConnection(ws, req) {
    // Check connection limit
    if (this.connectionCount >= this.maxConnections) {
      console.log(
        `Connection limit reached (${this.maxConnections}), rejecting new connection`
      );
      ws.close(1013, "Server overloaded");
      return;
    }

    this.connectionCount++;

    // Extract room information from URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomName = url.searchParams.get("room") || "default";

    // Track room connections
    const currentRoomCount = this.rooms.get(roomName) || 0;
    this.rooms.set(roomName, currentRoomCount + 1);

    console.log(`✅ New connection established`);
    console.log(`📊 Total connections: ${this.connectionCount}`);
    console.log(`🏠 Room: ${roomName} (${this.rooms.get(roomName)} users)`);
    console.log(`📡 Origin: ${req.headers.origin}`);
    console.log(`🔗 URL: ${req.url}`);
    console.log(`📋 Headers:`, req.headers);

    // Setup Yjs connection with custom options
    try {
      setupWSConnection(ws, req, {
        gc: true, // Enable garbage collection
        gcFilter: () => true, // Custom GC filter
      });
      console.log("🔄 Yjs connection setup successful");
    } catch (error) {
      console.error("Error setting up Yjs connection:", error);
      ws.close(1011, "Setup failed");
      this.connectionCount--;
      return;
    }

    // Store room name on the WebSocket for cleanup
    ws.roomName = roomName;

    // Handle connection events
    ws.on("close", (code, reason) => {
      this.connectionCount--;

      // Update room count
      const roomCount = this.rooms.get(roomName) || 1;
      if (roomCount <= 1) {
        this.rooms.delete(roomName);
        console.log(`🏠 Room ${roomName} is now empty and removed`);
      } else {
        this.rooms.set(roomName, roomCount - 1);
      }

      console.log(`❌ Connection closed (Code: ${code}, Reason: ${reason})`);
      console.log(`📊 Total connections: ${this.connectionCount}`);
      console.log(
        `🏠 Room: ${roomName} (${this.rooms.get(roomName) || 0} users)`
      );
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.connectionCount--;

      // Update room count on error
      const roomCount = this.rooms.get(roomName) || 1;
      if (roomCount <= 1) {
        this.rooms.delete(roomName);
      } else {
        this.rooms.set(roomName, roomCount - 1);
      }
    });

    ws.on("pong", () => {
      console.log("🏓 Received pong from client");
    });

    // Send welcome message (optional)
    try {
      ws.send(
        JSON.stringify({
          type: "server-welcome",
          message: "Connected to Yjs collaboration server",
          room: roomName,
          timestamp: new Date().toISOString(),
          version: "3.0.0+",
        })
      );
    } catch (error) {
      console.error("Error sending welcome message:", error);
    }
  }

  handleServerError(error) {
    console.error("❌ Server error:", error);
  }

  handleWebSocketServerError(error) {
    console.error("❌ WebSocket Server error:", error);
  }

  start() {
    this.server.listen(this.port, this.host, () => {
      console.log(`🚀 Yjs WebSocket server started successfully!`);
      console.log(`📡 Server running on: http://${this.host}:${this.port}`);
      console.log(`🔗 WebSocket endpoint: ws://${this.host}:${this.port}`);
      console.log(`🏥 Health check: http://${this.host}:${this.port}/health`);
      console.log(`📊 Statistics: http://${this.host}:${this.port}/stats`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`👥 Max connections: ${this.maxConnections}`);
      console.log(`📦 y-websocket version: 3.0.0+`);
      console.log(`🚂 Railway deployment ready!`);
    });
  }

  shutdown() {
    console.log("\n🛑 Shutting down server...");

    // Close all WebSocket connections gracefully
    this.wss.clients.forEach((ws) => {
      try {
        ws.close(1001, "Server shutting down");
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    });

    // Close the server
    this.server.close((error) => {
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
  }
}

// Create and start the server
const server = new YjsWebSocketServer();
server.start();

// Export for testing purposes
module.exports = YjsWebSocketServer;
