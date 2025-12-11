# Deploying Social Lite to Vercel

This guide explains how to deploy this application to Vercel.

## Prerequisites

1. A Vercel account (sign up at https://vercel.com)
2. A MongoDB database (recommended: MongoDB Atlas - free tier available)
3. Git repository connected to your project

## Environment Variables

You need to set the following environment variables in your Vercel project settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT token signing (any random string) | Yes |

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "Add New" → "Project"
4. Import your repository
5. Configure the following:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: Leave empty (uses vercel.json)
   - **Output Directory**: Leave empty
6. Add environment variables (MONGODB_URI, JWT_SECRET)
7. Click "Deploy"

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (follow the prompts)
vercel

# Deploy to production
vercel --prod
```

## Database Setup

Before deploying, set up your MongoDB database:

### Using MongoDB Atlas (Recommended):
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist IP addresses (use 0.0.0.0/0 for Vercel serverless functions)
5. Get your connection string and add it as `MONGODB_URI` in Vercel

The app will automatically create collections and indexes on first connection.

## Important Notes

### Socket.io Limitations
This application uses Socket.io for real-time messaging. Vercel's serverless architecture has limitations with WebSocket connections:

- Real-time messaging will work with polling fallback
- For full WebSocket support, consider:
  - Using a separate WebSocket server (e.g., on Railway, Render, or a VPS)
  - Using Vercel Edge Functions with WebSocket support
  - Using a third-party real-time service (Pusher, Ably, etc.)

### File Uploads
Vercel serverless functions are stateless, so file uploads stored locally won't persist. For production:
- Use cloud storage (Cloudinary, AWS S3, or Vercel Blob)
- Update the upload routes to use cloud storage

## Project Structure for Vercel

```
├── api/
│   └── index.ts          # Serverless API entry point (MongoDB)
├── client/
│   ├── src/              # React source files
│   └── dist/             # Built static files
└── vercel.json           # Vercel configuration
```

## vercel.json Configuration

The project includes a `vercel.json` that:
- Builds the React client as static files
- Runs the API as a serverless function
- Routes `/api/*` requests to the API
- Serves static files for the frontend

## Troubleshooting

### Build Fails
- Check that all dependencies are in package.json
- Ensure TypeScript compiles without errors
- Verify MongoDB driver is included in api/package.json

### API Not Working
- Verify MONGODB_URI is correctly set
- Check Vercel function logs for errors
- Ensure JWT_SECRET is configured
- Make sure MongoDB Atlas IP whitelist includes 0.0.0.0/0

### CORS Issues
- The API allows all origins by default
- Update CORS settings in api/index.ts if needed

### Database Connection Issues
- Verify MongoDB connection string format
- Check that database user has correct permissions
- Ensure IP whitelist is configured properly

## Local Development

To run locally (for development):
```bash
npm run dev
```

This runs both the client (port 5000) and server (port 3001) concurrently.

## Environment Variables Example

```
MONGODB_URI=mongodb+srv://aminulsordar69:12345@fb.aviaygg.mongodb.net/?appName=fb
JWT_SECRET=01849895103@abir
```
