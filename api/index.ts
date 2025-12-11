import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { MongoClient, Db, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();

const MONGODB_URI = process.env.MONGODB_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const REACTION_TYPES = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];

let db: Db;
let client: MongoClient;

async function connectMongoDB(): Promise<Db> {
  if (db) return db;
  
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('social_lite');
  
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('friendships').createIndex({ requester_id: 1, addressee_id: 1 }, { unique: true });
  await db.collection('post_likes').createIndex({ post_id: 1, user_id: 1 }, { unique: true });
  await db.collection('post_reactions').createIndex({ post_id: 1, user_id: 1 }, { unique: true });
  await db.collection('message_reactions').createIndex({ message_id: 1, user_id: 1 }, { unique: true });
  await db.collection('comments').createIndex({ post_id: 1 });
  
  console.log('Connected to MongoDB');
  return db;
}

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.post('/api/upload', (req, res) => {
  res.status(501).json({ 
    error: 'File uploads are not available on Vercel serverless. Please use a cloud storage service like Cloudinary, AWS S3, or Vercel Blob for file uploads in production.',
    suggestion: 'For avatar and cover photo URLs, use external image hosting services.'
  });
});

const authenticate = async (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.post('/api/auth/register', async (req, res) => {
  try {
    await connectMongoDB();
    const { email, password, firstName, lastName, dateOfBirth, gender } = req.body;
    
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await db.collection('users').insertOne({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      avatar_url: null,
      created_at: new Date()
    });

    const user = {
      id: result.insertedId.toString(),
      email: email.toLowerCase(),
      first_name: firstName,
      last_name: lastName
    };
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await connectMongoDB();
    const { email, password } = req.body;
    
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      user: {
        id: user._id.toString(),
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url
      }, 
      token 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/users/me', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.userId) },
      { projection: { password_hash: 0 } }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user._id.toString(),
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      avatar_url: user.avatar_url,
      created_at: user.created_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/users/search', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const users = await db.collection('users').find({
      _id: { $ne: new ObjectId(req.userId) },
      $or: [
        { first_name: { $regex: q, $options: 'i' } },
        { last_name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    }).limit(20).toArray();
    
    res.json(users.map(u => ({
      id: u._id.toString(),
      first_name: u.first_name,
      last_name: u.last_name,
      avatar_url: u.avatar_url
    })));
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/users/:id', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { password_hash: 0 } }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user._id.toString(),
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/friends', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const friendships = await db.collection('friendships').find({
      $or: [
        { requester_id: userId },
        { addressee_id: userId }
      ],
      status: 'accepted'
    }).toArray();
    
    const friendIds = friendships.map(f => 
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    
    const friends = await db.collection('users').find({
      _id: { $in: friendIds.map(id => new ObjectId(id)) }
    }).toArray();
    
    res.json(friends.map(u => ({
      id: u._id.toString(),
      first_name: u.first_name,
      last_name: u.last_name,
      avatar_url: u.avatar_url
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

app.get('/api/friends/requests', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const requests = await db.collection('friendships').find({
      addressee_id: userId,
      status: 'pending'
    }).sort({ created_at: -1 }).toArray();
    
    const enrichedRequests = await Promise.all(requests.map(async (request) => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(request.requester_id) });
      
      const myFriends = await db.collection('friendships').find({
        $or: [{ requester_id: userId }, { addressee_id: userId }],
        status: 'accepted'
      }).toArray();
      const myFriendIds = myFriends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
      
      const theirFriends = await db.collection('friendships').find({
        $or: [{ requester_id: request.requester_id }, { addressee_id: request.requester_id }],
        status: 'accepted'
      }).toArray();
      const theirFriendIds = theirFriends.map(f => f.requester_id === request.requester_id ? f.addressee_id : f.requester_id);
      
      const mutualIds = myFriendIds.filter(id => theirFriendIds.includes(id));
      const mutualFriends = await db.collection('users').find({
        _id: { $in: mutualIds.slice(0, 3).map(id => new ObjectId(id)) }
      }).toArray();
      
      return {
        id: user?._id.toString(),
        first_name: user?.first_name,
        last_name: user?.last_name,
        avatar_url: user?.avatar_url,
        request_id: request._id.toString(),
        created_at: request.created_at,
        mutual_friends: mutualFriends.map(m => ({
          id: m._id.toString(),
          first_name: m.first_name,
          last_name: m.last_name,
          avatar_url: m.avatar_url
        })),
        mutual_friends_count: mutualIds.length
      };
    }));
    
    res.json(enrichedRequests);
  } catch (err) {
    console.error('Friend requests error:', err);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

app.get('/api/friends/suggestions', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const existingConnections = await db.collection('friendships').find({
      $or: [{ requester_id: userId }, { addressee_id: userId }]
    }).toArray();
    const connectedIds = existingConnections.map(f => 
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    connectedIds.push(userId);
    
    const hiddenSuggestions = await db.collection('friend_suggestions_hidden').find({
      user_id: userId
    }).toArray();
    const hiddenIds = hiddenSuggestions.map(h => h.hidden_user_id);
    
    const blocks = await db.collection('user_blocks').find({
      $or: [{ blocker_id: userId }, { blocked_id: userId }]
    }).toArray();
    const blockedIds = blocks.map(b => b.blocker_id === userId ? b.blocked_id : b.blocker_id);
    
    const excludeIds = [...connectedIds, ...hiddenIds, ...blockedIds];
    
    const suggestions = await db.collection('users').find({
      _id: { $nin: excludeIds.map(id => new ObjectId(id)) }
    }).limit(20).toArray();
    
    const myFriends = await db.collection('friendships').find({
      $or: [{ requester_id: userId }, { addressee_id: userId }],
      status: 'accepted'
    }).toArray();
    const myFriendIds = myFriends.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
    
    const enrichedSuggestions = await Promise.all(suggestions.map(async (user) => {
      const theirFriends = await db.collection('friendships').find({
        $or: [{ requester_id: user._id.toString() }, { addressee_id: user._id.toString() }],
        status: 'accepted'
      }).toArray();
      const theirFriendIds = theirFriends.map(f => 
        f.requester_id === user._id.toString() ? f.addressee_id : f.requester_id
      );
      
      const mutualIds = myFriendIds.filter(id => theirFriendIds.includes(id));
      const mutualFriends = await db.collection('users').find({
        _id: { $in: mutualIds.slice(0, 3).map(id => new ObjectId(id)) }
      }).toArray();
      
      return {
        id: user._id.toString(),
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        mutual_friends: mutualFriends.map(m => ({
          id: m._id.toString(),
          first_name: m.first_name,
          last_name: m.last_name,
          avatar_url: m.avatar_url
        })),
        mutual_friends_count: mutualIds.length
      };
    }));
    
    enrichedSuggestions.sort((a, b) => b.mutual_friends_count - a.mutual_friends_count);
    
    res.json(enrichedSuggestions);
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

app.post('/api/friends/suggestions/hide/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('friend_suggestions_hidden').updateOne(
      { user_id: req.userId, hidden_user_id: req.params.userId },
      { $set: { user_id: req.userId, hidden_user_id: req.params.userId } },
      { upsert: true }
    );
    res.json({ message: 'Suggestion hidden' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to hide suggestion' });
  }
});

app.post('/api/friends/request/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const targetId = req.params.userId;
    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const existing = await db.collection('friendships').findOne({
      $or: [
        { requester_id: req.userId, addressee_id: targetId },
        { requester_id: targetId, addressee_id: req.userId }
      ]
    });

    if (existing) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }

    await db.collection('friendships').insertOne({
      requester_id: req.userId,
      addressee_id: targetId,
      status: 'pending',
      created_at: new Date()
    });
    
    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

app.post('/api/friends/accept/:requestId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const result = await db.collection('friendships').updateOne(
      { _id: new ObjectId(req.params.requestId), addressee_id: req.userId },
      { $set: { status: 'accepted' } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

app.post('/api/friends/decline/:requestId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('friendships').deleteOne({
      _id: new ObjectId(req.params.requestId),
      addressee_id: req.userId
    });
    res.json({ message: 'Friend request declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

app.delete('/api/friends/:friendId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('friendships').deleteOne({
      $or: [
        { requester_id: req.userId, addressee_id: req.params.friendId },
        { requester_id: req.params.friendId, addressee_id: req.userId }
      ],
      status: 'accepted'
    });
    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

app.post('/api/friends/block/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const targetId = req.params.userId;
    
    await db.collection('friendships').deleteMany({
      $or: [
        { requester_id: req.userId, addressee_id: targetId },
        { requester_id: targetId, addressee_id: req.userId }
      ]
    });
    
    await db.collection('user_blocks').updateOne(
      { blocker_id: req.userId, blocked_id: targetId },
      { $set: { blocker_id: req.userId, blocked_id: targetId, created_at: new Date() } },
      { upsert: true }
    );
    
    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

app.delete('/api/friends/block/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('user_blocks').deleteOne({
      blocker_id: req.userId,
      blocked_id: req.params.userId
    });
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

app.get('/api/posts/feed', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const friendships = await db.collection('friendships').find({
      $or: [
        { requester_id: userId },
        { addressee_id: userId }
      ],
      status: 'accepted'
    }).toArray();
    
    const friendIds = friendships.map(f => 
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    friendIds.push(userId);
    
    const posts = await db.collection('posts').find({
      user_id: { $in: friendIds }
    }).sort({ created_at: -1 }).limit(50).toArray();
    
    const enrichedPosts = await Promise.all(posts.map(async (post) => {
      const author = await db.collection('users').findOne({ _id: new ObjectId(post.user_id) });
      const reactions = await db.collection('post_reactions').find({ post_id: post._id.toString() }).toArray();
      const myReaction = reactions.find(r => r.user_id === userId);
      const comments = await db.collection('comments').find({ post_id: post._id.toString() }).toArray();
      
      const reactionSummary = REACTION_TYPES.map(type => ({
        reaction: type,
        count: reactions.filter(r => r.reaction === type).length
      })).filter(r => r.count > 0);
      
      return {
        id: post._id.toString(),
        content: post.content,
        created_at: post.created_at,
        author: author ? {
          id: author._id.toString(),
          first_name: author.first_name,
          last_name: author.last_name,
          avatar_url: author.avatar_url
        } : null,
        reaction_count: reactions.length,
        reaction_summary: reactionSummary.length > 0 ? reactionSummary : null,
        my_reaction: myReaction?.reaction || null,
        comment_count: comments.length
      };
    }));
    
    res.json(enrichedPosts);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

app.get('/api/posts/user/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    const targetUserId = req.params.userId;
    
    const posts = await db.collection('posts').find({
      user_id: targetUserId
    }).sort({ created_at: -1 }).toArray();
    
    const enrichedPosts = await Promise.all(posts.map(async (post) => {
      const author = await db.collection('users').findOne({ _id: new ObjectId(post.user_id) });
      const reactions = await db.collection('post_reactions').find({ post_id: post._id.toString() }).toArray();
      const myReaction = reactions.find(r => r.user_id === userId);
      const comments = await db.collection('comments').find({ post_id: post._id.toString() }).toArray();
      
      const reactionSummary = REACTION_TYPES.map(type => ({
        reaction: type,
        count: reactions.filter(r => r.reaction === type).length
      })).filter(r => r.count > 0);
      
      return {
        id: post._id.toString(),
        content: post.content,
        created_at: post.created_at,
        author: author ? {
          id: author._id.toString(),
          first_name: author.first_name,
          last_name: author.last_name,
          avatar_url: author.avatar_url
        } : null,
        reaction_count: reactions.length,
        reaction_summary: reactionSummary.length > 0 ? reactionSummary : null,
        my_reaction: myReaction?.reaction || null,
        comment_count: comments.length
      };
    }));
    
    res.json(enrichedPosts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post must have text content' });
    }
    
    const result = await db.collection('posts').insertOne({
      user_id: req.userId,
      content: content.trim(),
      created_at: new Date()
    });
    
    const author = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    
    res.json({
      id: result.insertedId.toString(),
      content: content.trim(),
      created_at: new Date(),
      author: author ? {
        id: author._id.toString(),
        first_name: author.first_name,
        last_name: author.last_name,
        avatar_url: author.avatar_url
      } : null,
      reaction_count: 0,
      reaction_summary: null,
      my_reaction: null,
      comment_count: 0
    });
  } catch (err) {
    console.error('Post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.post('/api/posts/:postId/react', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const postId = req.params.postId;
    const { reaction } = req.body;
    
    if (!reaction) {
      await db.collection('post_reactions').deleteOne({
        post_id: postId,
        user_id: req.userId
      });
      return res.json({ reaction: null });
    }
    
    if (!REACTION_TYPES.includes(reaction)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }
    
    await db.collection('post_reactions').updateOne(
      { post_id: postId, user_id: req.userId },
      { $set: { reaction, created_at: new Date() } },
      { upsert: true }
    );
    
    const reactions = await db.collection('post_reactions').find({ post_id: postId }).toArray();
    const reactionSummary = REACTION_TYPES.map(type => ({
      reaction: type,
      count: reactions.filter(r => r.reaction === type).length
    })).filter(r => r.count > 0);
    
    res.json({ 
      reaction, 
      reaction_summary: reactionSummary,
      reaction_count: reactions.length
    });
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: 'Failed to react to post' });
  }
});

app.get('/api/posts/:postId/reactions', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const reactions = await db.collection('post_reactions').find({
      post_id: req.params.postId
    }).toArray();
    
    const enrichedReactions = await Promise.all(reactions.map(async (r) => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(r.user_id) });
      return {
        reaction: r.reaction,
        id: user?._id.toString(),
        first_name: user?.first_name,
        last_name: user?.last_name,
        avatar_url: user?.avatar_url
      };
    }));
    
    res.json(enrichedReactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
});

app.get('/api/posts/:postId/comments', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const comments = await db.collection('comments').find({
      post_id: req.params.postId
    }).sort({ created_at: 1 }).toArray();
    
    const enrichedComments = await Promise.all(comments.map(async (c) => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(c.user_id) });
      return {
        id: c._id.toString(),
        content: c.content,
        created_at: c.created_at,
        author: user ? {
          id: user._id.toString(),
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.avatar_url
        } : null
      };
    }));
    
    res.json(enrichedComments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/posts/:postId/comments', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment must have content' });
    }
    
    const result = await db.collection('comments').insertOne({
      post_id: req.params.postId,
      user_id: req.userId,
      content: content.trim(),
      created_at: new Date()
    });
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    
    res.json({
      id: result.insertedId.toString(),
      content: content.trim(),
      created_at: new Date(),
      author: user ? {
        id: user._id.toString(),
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url
      } : null
    });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

app.delete('/api/posts/:postId/comments/:commentId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('comments').deleteOne({
      _id: new ObjectId(req.params.commentId),
      user_id: req.userId
    });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

app.delete('/api/posts/:postId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('posts').deleteOne({
      _id: new ObjectId(req.params.postId),
      user_id: req.userId
    });
    await db.collection('comments').deleteMany({ post_id: req.params.postId });
    await db.collection('post_reactions').deleteMany({ post_id: req.params.postId });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.get('/api/profile/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.params.userId;
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const profile = await db.collection('user_profiles').findOne({ user_id: userId });
    
    const friendships = await db.collection('friendships').find({
      $or: [{ requester_id: userId }, { addressee_id: userId }],
      status: 'accepted'
    }).toArray();
    
    const friendIds = friendships.map(f => 
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    
    const friends = await db.collection('users').find({
      _id: { $in: friendIds.slice(0, 6).map(id => new ObjectId(id)) }
    }).toArray();
    
    let friendshipStatus = null;
    if (userId !== req.userId) {
      const fs = await db.collection('friendships').findOne({
        $or: [
          { requester_id: req.userId, addressee_id: userId },
          { requester_id: userId, addressee_id: req.userId }
        ]
      });
      
      if (fs) {
        if (fs.status === 'accepted') {
          friendshipStatus = 'friends';
        } else if (fs.requester_id === req.userId) {
          friendshipStatus = 'pending_sent';
        } else {
          friendshipStatus = 'pending_received';
        }
      }
    }
    
    res.json({
      id: user._id.toString(),
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      bio: profile?.bio || null,
      work: profile?.work || null,
      location: profile?.location || null,
      cover_photo_url: profile?.cover_photo_url || null,
      friend_count: friendIds.length,
      friends: friends.map(f => ({
        id: f._id.toString(),
        first_name: f.first_name,
        last_name: f.last_name,
        avatar_url: f.avatar_url
      })),
      friendship_status: friendshipStatus,
      is_own_profile: userId === req.userId
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/profile', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { bio, work, location, coverPhotoUrl, avatarUrl, firstName, lastName } = req.body;
    
    if (firstName || lastName || avatarUrl) {
      const updateFields: any = {};
      if (firstName) updateFields.first_name = firstName;
      if (lastName) updateFields.last_name = lastName;
      if (avatarUrl) updateFields.avatar_url = avatarUrl;
      
      await db.collection('users').updateOne(
        { _id: new ObjectId(req.userId) },
        { $set: updateFields }
      );
    }
    
    const profileUpdate: any = { user_id: req.userId };
    if (bio !== undefined) profileUpdate.bio = bio;
    if (work !== undefined) profileUpdate.work = work;
    if (location !== undefined) profileUpdate.location = location;
    if (coverPhotoUrl !== undefined) profileUpdate.cover_photo_url = coverPhotoUrl;
    
    await db.collection('user_profiles').updateOne(
      { user_id: req.userId },
      { $set: profileUpdate },
      { upsert: true }
    );
    
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.get('/api/messages/conversations', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const participations = await db.collection('conversation_participants').find({
      user_id: userId
    }).toArray();
    
    const conversations = await Promise.all(participations.map(async (p) => {
      const conv = await db.collection('conversations').findOne({ _id: new ObjectId(p.conversation_id) });
      if (!conv) return null;
      
      const allParticipants = await db.collection('conversation_participants').find({
        conversation_id: p.conversation_id,
        user_id: { $ne: userId }
      }).toArray();
      
      const participants = await Promise.all(allParticipants.map(async (ap) => {
        const user = await db.collection('users').findOne({ _id: new ObjectId(ap.user_id) });
        return user ? {
          id: user._id.toString(),
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.avatar_url,
          nickname: ap.nickname,
          is_admin: ap.is_admin
        } : null;
      }));
      
      const lastMessage = await db.collection('messages').findOne(
        { conversation_id: p.conversation_id },
        { sort: { created_at: -1 } }
      );
      
      const memberCount = await db.collection('conversation_participants').countDocuments({
        conversation_id: p.conversation_id
      });
      
      return {
        id: conv._id.toString(),
        is_group: conv.is_group,
        name: conv.name,
        photo_url: conv.photo_url,
        created_at: conv.created_at,
        participants: participants.filter(Boolean),
        last_message: lastMessage ? {
          content: lastMessage.content,
          created_at: lastMessage.created_at,
          sender_id: lastMessage.sender_id
        } : null,
        is_muted: p.is_muted,
        member_count: memberCount
      };
    }));
    
    const validConversations = conversations.filter(Boolean);
    validConversations.sort((a, b) => {
      const aTime = a!.last_message?.created_at || a!.created_at;
      const bTime = b!.last_message?.created_at || b!.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    
    res.json(validConversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/messages/conversation/:id', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const participant = await db.collection('conversation_participants').findOne({
      conversation_id: req.params.id,
      user_id: userId
    });
    
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant of this conversation' });
    }

    const messages = await db.collection('messages').find({
      conversation_id: req.params.id
    }).sort({ created_at: 1 }).toArray();
    
    const enrichedMessages = await Promise.all(messages.map(async (m) => {
      const sender = await db.collection('users').findOne({ _id: new ObjectId(m.sender_id) });
      const reactions = await db.collection('message_reactions').find({
        message_id: m._id.toString()
      }).toArray();
      
      const deletion = await db.collection('message_deletions').findOne({
        message_id: m._id.toString(),
        $or: [
          { user_id: userId },
          { deleted_for_everyone: true }
        ]
      });
      
      if (deletion && !deletion.deleted_for_everyone && deletion.user_id === userId) {
        return null;
      }
      
      return {
        id: m._id.toString(),
        conversation_id: m.conversation_id,
        content: deletion?.deleted_for_everyone ? '[Message deleted]' : m.content,
        created_at: m.created_at,
        sender: sender ? {
          id: sender._id.toString(),
          first_name: sender.first_name,
          last_name: sender.last_name,
          avatar_url: sender.avatar_url
        } : null,
        reactions: reactions.map(r => ({
          user_id: r.user_id,
          reaction: r.reaction
        })),
        deleted_for_everyone: deletion?.deleted_for_everyone || false
      };
    }));
    
    res.json(enrichedMessages.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/messages/conversation/:id/info', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const userId = req.userId;
    
    const participant = await db.collection('conversation_participants').findOne({
      conversation_id: req.params.id,
      user_id: userId
    });
    
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const conv = await db.collection('conversations').findOne({ _id: new ObjectId(req.params.id) });
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const allParticipants = await db.collection('conversation_participants').find({
      conversation_id: req.params.id
    }).toArray();
    
    const members = await Promise.all(allParticipants.map(async (p) => {
      const user = await db.collection('users').findOne({ _id: new ObjectId(p.user_id) });
      return user ? {
        id: user._id.toString(),
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_url: user.avatar_url,
        nickname: p.nickname,
        is_admin: p.is_admin,
        joined_at: p.joined_at
      } : null;
    }));

    res.json({
      id: conv._id.toString(),
      is_group: conv.is_group,
      name: conv.name,
      photo_url: conv.photo_url,
      created_at: conv.created_at,
      members: members.filter(Boolean),
      is_muted: participant.is_muted,
      my_nickname: participant.nickname,
      is_admin: participant.is_admin
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation info' });
  }
});

app.post('/api/messages/conversation/start/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const targetId = req.params.userId;
    
    const myConvs = await db.collection('conversation_participants').find({
      user_id: req.userId
    }).toArray();
    
    for (const mc of myConvs) {
      const conv = await db.collection('conversations').findOne({
        _id: new ObjectId(mc.conversation_id),
        is_group: false
      });
      
      if (conv) {
        const otherParticipant = await db.collection('conversation_participants').findOne({
          conversation_id: mc.conversation_id,
          user_id: targetId
        });
        
        if (otherParticipant) {
          const count = await db.collection('conversation_participants').countDocuments({
            conversation_id: mc.conversation_id
          });
          
          if (count === 2) {
            return res.json({ conversationId: mc.conversation_id });
          }
        }
      }
    }

    const result = await db.collection('conversations').insertOne({
      is_group: false,
      name: null,
      photo_url: null,
      created_at: new Date()
    });
    const convId = result.insertedId.toString();

    await db.collection('conversation_participants').insertMany([
      { conversation_id: convId, user_id: req.userId, is_admin: false, is_muted: false, joined_at: new Date() },
      { conversation_id: convId, user_id: targetId, is_admin: false, is_muted: false, joined_at: new Date() }
    ]);

    res.json({ conversationId: convId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

app.post('/api/messages/conversation/group', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { name, userIds } = req.body;
    
    const result = await db.collection('conversations').insertOne({
      is_group: true,
      name: name || 'Group Chat',
      photo_url: null,
      created_at: new Date()
    });
    const convId = result.insertedId.toString();

    await db.collection('conversation_participants').insertOne({
      conversation_id: convId,
      user_id: req.userId,
      is_admin: true,
      is_muted: false,
      joined_at: new Date()
    });

    for (const userId of userIds) {
      if (userId !== req.userId) {
        await db.collection('conversation_participants').insertOne({
          conversation_id: convId,
          user_id: userId,
          is_admin: false,
          is_muted: false,
          joined_at: new Date()
        });
      }
    }

    res.json({ conversationId: convId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.put('/api/messages/conversation/:id/name', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { name } = req.body;
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name } }
    );
    res.json({ message: 'Group name updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group name' });
  }
});

app.put('/api/messages/conversation/:id/photo', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { photoUrl } = req.body;
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { photo_url: photoUrl } }
    );
    res.json({ message: 'Group photo updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group photo' });
  }
});

app.post('/api/messages/conversation/:id/members', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { userId } = req.body;
    await db.collection('conversation_participants').updateOne(
      { conversation_id: req.params.id, user_id: userId },
      { $set: { conversation_id: req.params.id, user_id: userId, is_admin: false, is_muted: false, joined_at: new Date() } },
      { upsert: true }
    );
    res.json({ message: 'Member added' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/messages/conversation/:id/members/:userId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('conversation_participants').deleteOne({
      conversation_id: req.params.id,
      user_id: req.params.userId
    });
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

app.post('/api/messages/conversation/:id/leave', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    await db.collection('conversation_participants').deleteOne({
      conversation_id: req.params.id,
      user_id: req.userId
    });
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

app.put('/api/messages/conversation/:id/mute', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { muted } = req.body;
    await db.collection('conversation_participants').updateOne(
      { conversation_id: req.params.id, user_id: req.userId },
      { $set: { is_muted: muted } }
    );
    res.json({ message: muted ? 'Muted' : 'Unmuted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mute status' });
  }
});

app.put('/api/messages/conversation/:id/nickname', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { userId, nickname } = req.body;
    await db.collection('conversation_participants').updateOne(
      { conversation_id: req.params.id, user_id: userId },
      { $set: { nickname } }
    );
    res.json({ message: 'Nickname updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update nickname' });
  }
});

app.post('/api/messages/send/:conversationId', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { content } = req.body;
    
    const participant = await db.collection('conversation_participants').findOne({
      conversation_id: req.params.conversationId,
      user_id: req.userId
    });
    
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const result = await db.collection('messages').insertOne({
      conversation_id: req.params.conversationId,
      sender_id: req.userId,
      content,
      created_at: new Date()
    });

    const sender = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });

    res.json({
      id: result.insertedId.toString(),
      conversation_id: req.params.conversationId,
      content,
      created_at: new Date(),
      sender: sender ? {
        id: sender._id.toString(),
        first_name: sender.first_name,
        last_name: sender.last_name,
        avatar_url: sender.avatar_url
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.post('/api/messages/message/:id/reaction', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { reaction } = req.body;
    
    if (!reaction) {
      await db.collection('message_reactions').deleteOne({
        message_id: req.params.id,
        user_id: req.userId
      });
    } else {
      await db.collection('message_reactions').updateOne(
        { message_id: req.params.id, user_id: req.userId },
        { $set: { reaction, created_at: new Date() } },
        { upsert: true }
      );
    }
    res.json({ message: 'Reaction updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to react to message' });
  }
});

app.delete('/api/messages/message/:id', authenticate, async (req: any, res) => {
  try {
    await connectMongoDB();
    const { forEveryone } = req.body;
    
    if (forEveryone) {
      const msg = await db.collection('messages').findOne({ _id: new ObjectId(req.params.id) });
      if (msg?.sender_id !== req.userId) {
        return res.status(403).json({ error: 'Can only delete your own messages for everyone' });
      }
      await db.collection('message_deletions').updateOne(
        { message_id: req.params.id, user_id: req.userId },
        { $set: { message_id: req.params.id, user_id: req.userId, deleted_for_everyone: true } },
        { upsert: true }
      );
    } else {
      await db.collection('message_deletions').updateOne(
        { message_id: req.params.id, user_id: req.userId },
        { $set: { message_id: req.params.id, user_id: req.userId, deleted_for_everyone: false } },
        { upsert: true }
      );
    }
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default app;
