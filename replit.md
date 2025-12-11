# Social Lite - Facebook Lite Clone

## Overview
A social networking website similar to Facebook Lite with user registration, profiles, text-only posts with comments, friend system, and real-time messaging.

## Tech Stack
- **Frontend**: React with Vite, React Router
- **Backend**: Node.js with Express
- **Database**: MongoDB (Atlas)
- **Real-time**: Socket.IO for messaging
- **Authentication**: JWT tokens with bcrypt password hashing

## Project Structure
```
/
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/       # Page components (Home, Profile, Chat, Friends, etc)
│   │   ├── context/     # Auth and Socket contexts
│   │   └── styles.css   # Mobile-first CSS
│   └── vite.config.ts
├── server/               # Express backend
│   ├── src/
│   │   ├── routes/      # API endpoints (auth, users, friends, posts, profile, messages)
│   │   ├── middleware/  # Auth middleware
│   │   ├── socket.ts    # Socket.IO handlers
│   │   └── mongodb.ts   # MongoDB connection and collections
│   └── package.json
└── package.json          # Root package with concurrently
```

## Features
1. **Multi-step Signup**: Name → Birthday → Gender → Email → Password (with duplicate email checking)
2. **Authentication**: Email/password login with JWT sessions
3. **User Profiles**: Cover photo, avatar, bio, work info, friend list
4. **Posts**: Create text-only posts (no photo uploads)
5. **Comments**: Comment on posts with threaded discussions
6. **Post Reactions**: Like, Love, Care, Haha, Wow, Sad, Angry reactions
7. **News Feed**: See posts from yourself and friends
8. **Friend System**: 
   - Send/accept/decline friend requests
   - Mutual friends count display
   - People you may know suggestions
   - Hide/remove suggestions
   - Block users
9. **Real-time Messenger**: 
   - Live chat with Socket.IO
   - Message reactions (heart, laugh, wow, sad, angry, thumbs up)
   - Delete messages (for me / for everyone)
   - Chat settings (mute, nicknames, quick reactions)
10. **Group Chats**:
    - Create group conversations
    - Change group name and photo
    - See members with admin badges
    - Leave group
11. **User Search**: Find people by name or email

## MongoDB Collections
- **users**: _id, email, password_hash, first_name, last_name, date_of_birth, gender, avatar_url, bio, work, location, cover_photo_url
- **posts**: _id, user_id, content, created_at
- **post_reactions**: _id, post_id, user_id, reaction, created_at
- **comments**: _id, post_id, user_id, content, created_at
- **friendships**: _id, requester_id, addressee_id, status (pending/accepted), created_at
- **conversations**: _id, is_group, name, photo_url, created_at
- **conversation_participants**: _id, conversation_id, user_id, nickname, is_admin, is_muted, joined_at
- **messages**: _id, conversation_id, sender_id, content, created_at
- **message_reactions**: _id, message_id, user_id, reaction, created_at
- **message_deletions**: _id, message_id, user_id, deleted_for_everyone
- **user_blocks**: _id, blocker_id, blocked_id, created_at
- **friend_suggestions_hidden**: _id, user_id, hidden_user_id

## Environment Variables
- **MONGODB_URI**: MongoDB connection string (stored as Replit Secret)
- **JWT_SECRET**: Secret for JWT tokens (auto-generated if not set)

## Running the App
- `npm run dev` - Starts both frontend (port 5000) and backend (port 3001)

## Vercel Deployment
The project is configured for Vercel deployment with:
- `api/index.ts` - Serverless API entry point (MongoDB-based)
- `vercel.json` - Build and routing configuration
- `VERCEL_DEPLOYMENT.md` - Detailed deployment guide

**Required Environment Variables on Vercel:**
- `MONGODB_URI` - MongoDB Atlas connection string
- `JWT_SECRET` - Secret for JWT token signing

**Note:** File uploads are not available on Vercel's serverless architecture. Use cloud storage (Cloudinary, AWS S3, or Vercel Blob) for profile photos in production.

## Recent Changes
- December 11, 2025: Complete Vercel deployment preparation:
  - Created api/index.ts with full MongoDB-based API routes
  - All routes match server implementation (auth, users, friends, posts, messages, profile)
  - Added vercel.json for monorepo structure
  - Created .vercelignore for clean deployments
  - Updated VERCEL_DEPLOYMENT.md with MongoDB instructions
- December 11, 2025: Major update - Migrated to MongoDB:
  - Replaced PostgreSQL with MongoDB Atlas
  - Added email duplicate checking during registration
  - Changed posts to text-only (removed photo uploads)
  - Added commenting system for posts
  - Updated all ID types from number to string (MongoDB ObjectId)
  - MongoDB URI stored securely as Replit Secret
- December 10, 2025: Added Facebook-like features:
  - Friend requests page with mutual friends count
  - People you may know suggestions
  - Message reactions (heart, laugh, wow, sad, angry, thumbs up)
  - Delete message options (for me / for everyone)
  - Chat settings (mark as unread, mute, nicknames, block)
  - Group chat features (create, name/photo, members list, leave)
  - Post reactions (Like, Love, Care, Haha, Wow, Sad, Angry)
- December 10, 2025: Initial implementation with full feature set
