const WebSocket = require("ws");
const http = require("http");

// Simple WebSocket server for Yjs
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() })
    );
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <h1>Yjs WebSocket Server</h1>
    <p>Server is running on port 3001</p>
    <p>WebSocket URL: ws://localhost:3001</p>
  `);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection");

  // Import and setup Yjs connection
  const { setupWSConnection } = require("y-websocket/bin/utils.js");
  setupWSConnection(ws, req);

  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Yjs WebSocket server running on http://localhost:${PORT}`);
  console.log(`🔗 WebSocket endpoint: ws://localhost:${PORT}`);
});
