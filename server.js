const WebSocket = require("ws");
const http = require("http");
const { setupWSConnection } = require("y-websocket/bin/utils.js");
require("dotenv").config();

class YjsWebSocketServer {
  constructor() {
    // Railway automatically sets PORT environment variable
    this.port = process.env.PORT || 3001;
    this.host = "0.0.0.0"; // Important: Must be 0.0.0.0 for Railway
    this.maxConnections = Number.parseInt(process.env.MAX_CONNECTIONS) || 1000;
    this.connectionCount = 0;
    this.rooms = new Map();

    console.log(`🔧 Starting server on port: ${this.port}`);
    console.log(`🔧 Host: ${this.host}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);

    this.createServer();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  createServer() {
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
            port: this.port,
            host: this.host,
            env: process.env.NODE_ENV || "development",
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

      // Default response with Railway-specific info
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Yjs WebSocket Server - Railway</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { color: green; font-weight: bold; font-size: 18px; }
            .info { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .url { background: #e9ecef; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; }
            .section { margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Yjs WebSocket Server</h1>
            <p class="status">✅ Server is running successfully on Railway!</p>
            
            <div class="section">
              <h3>🔗 Connection Information:</h3>
              <div class="info">
                <p><strong>HTTP URL:</strong></p>
                <div class="url">https://${req.headers.host}</div>
                
                <p><strong>WebSocket URL:</strong></p>
                <div class="url">wss://${req.headers.host}</div>
                
                <p><strong>Port:</strong> ${this.port}</p>
                <p><strong>Environment:</strong> ${
                  process.env.NODE_ENV || "development"
                }</p>
              </div>
            </div>

            <div class="section">
              <h3>📊 Server Statistics:</h3>
              <div class="info">
                <p><strong>Active Connections:</strong> ${
                  this.connectionCount
                }</p>
                <p><strong>Active Rooms:</strong> ${this.rooms.size}</p>
                <p><strong>Max Connections:</strong> ${this.maxConnections}</p>
                <p><strong>Uptime:</strong> ${Math.floor(
                  process.uptime()
                )} seconds</p>
              </div>
            </div>

            <div class="section">
              <h3>🔧 API Endpoints:</h3>
              <div class="info">
                <p><strong>Health Check:</strong> <a href="/health" target="_blank">/health</a></p>
                <p><strong>Statistics:</strong> <a href="/stats" target="_blank">/stats</a></p>
              </div>
            </div>

            <div class="section">
              <h3>📝 Usage Instructions:</h3>
              <div class="info">
                <p>1. Copy the WebSocket URL above</p>
                <p>2. Set it as <code>NEXT_PUBLIC_YJS_WEBSOCKET_URL</code> in your Next.js environment</p>
                <p>3. Your TipTap editor will automatically connect for real-time collaboration</p>
              </div>
            </div>
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
      perMessageDeflate: {
        zlibDeflateOptions: {
          threshold: 1024,
          concurrencyLimit: 10,
        },
      },
    });
  }

  setupEventHandlers() {
    this.wss.on("connection", this.handleConnection.bind(this));
    this.server.on("error", this.handleServerError.bind(this));

    // Graceful shutdown
    process.on("SIGINT", this.shutdown.bind(this));
    process.on("SIGTERM", this.shutdown.bind(this));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });
  }

  handleConnection(ws, req) {
    if (this.connectionCount >= this.maxConnections) {
      console.log(
        `Connection limit reached (${this.maxConnections}), rejecting new connection`
      );
      ws.close(1013, "Server overloaded");
      return;
    }

    this.connectionCount++;

    // Extract room information from URL
    let roomName = "default";
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      roomName = url.searchParams.get("room") || "default";
    } catch (error) {
      console.log("Error parsing URL, using default room:", error.message);
    }

    // Track room connections
    const currentRoomCount = this.rooms.get(roomName) || 0;
    this.rooms.set(roomName, currentRoomCount + 1);

    console.log(`✅ New connection established`);
    console.log(`📊 Total connections: ${this.connectionCount}`);
    console.log(`🏠 Room: ${roomName} (${this.rooms.get(roomName)} users)`);

    // Setup Yjs connection
    try {
      setupWSConnection(ws, req, {
        gc: true,
        gcFilter: () => true,
      });
    } catch (error) {
      console.error("Error setting up Yjs connection:", error);
      ws.close(1011, "Setup failed");
      this.connectionCount--;
      return;
    }

    ws.roomName = roomName;

    ws.on("close", () => {
      this.connectionCount--;
      const roomCount = this.rooms.get(roomName) || 1;
      if (roomCount <= 1) {
        this.rooms.delete(roomName);
        console.log(`🏠 Room ${roomName} is now empty and removed`);
      } else {
        this.rooms.set(roomName, roomCount - 1);
      }
      console.log(`❌ Connection closed - Total: ${this.connectionCount}`);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      this.connectionCount--;
      const roomCount = this.rooms.get(roomName) || 1;
      if (roomCount <= 1) {
        this.rooms.delete(roomName);
      } else {
        this.rooms.set(roomName, roomCount - 1);
      }
    });
  }

  handleServerError(error) {
    console.error("❌ Server error:", error);
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
      console.log(`🚂 Railway deployment ready!`);
    });
  }

  shutdown() {
    console.log("\n🛑 Shutting down server...");
    this.wss.clients.forEach((ws) => {
      try {
        ws.close(1001, "Server shutting down");
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    });

    this.server.close((error) => {
      if (error) {
        console.error("Error closing server:", error);
        process.exit(1);
      } else {
        console.log("✅ Server closed gracefully");
        process.exit(0);
      }
    });

    setTimeout(() => {
      console.log("⚠️ Forcing server shutdown...");
      process.exit(1);
    }, 10000);
  }
}

// Create and start the server
const server = new YjsWebSocketServer();
server.start();

module.exports = YjsWebSocketServer;
