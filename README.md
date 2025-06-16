# Yjs WebSocket Server for Railway

A production-ready WebSocket server for Yjs real-time collaboration, optimized for Railway deployment.

## Features

- ✅ Real-time collaborative editing with Yjs
- 🔄 Automatic reconnection handling
- 📊 Health checks and monitoring endpoints
- 🏠 Room-based collaboration
- 🛡️ Connection limits and error handling
- 🚀 Railway deployment ready
- 📈 Performance monitoring

## Local Development

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Server will be available at:

- HTTP: http://localhost:3001
- WebSocket: ws://localhost:3001
- Health: http://localhost:3001/health

## Railway Deployment

### Method 1: GitHub Integration (Recommended)

1. Push this code to a GitHub repository
2. Connect your GitHub account to Railway
3. Create a new project and select your repository
4. Railway will automatically detect the Node.js project and deploy

### Method 2: Railway CLI

1. Install Railway CLI:
   \`\`\`bash
   npm install -g @railway/cli
   \`\`\`

2. Login to Railway:
   \`\`\`bash
   railway login
   \`\`\`

3. Initialize and deploy:
   \`\`\`bash
   railway init
   railway up
   \`\`\`

## Environment Variables

Set these in Railway dashboard:

- `PORT`: Server port (default: 3001)
- `HOST`: Server host (default: 0.0.0.0)
- `MAX_CONNECTIONS`: Maximum concurrent connections (default: 1000)
- `NODE_ENV`: Environment (production)

## Monitoring

- Health Check: `GET /health`
- Statistics: `GET /stats`
- Server Info: `GET /`

## Usage with TipTap

Update your Next.js environment variables:

\`\`\`env
NEXT_PUBLIC_YJS_WEBSOCKET_URL=wss://your-railway-domain.railway.app
\`\`\`

## Scaling

Railway automatically handles:

- Load balancing
- Auto-scaling based on traffic
- SSL/TLS termination
- Health monitoring
