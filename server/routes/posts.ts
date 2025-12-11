import { Router } from 'express';
import { getDb, ObjectId } from '../mongodb.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

const REACTION_TYPES = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'];

router.get('/feed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.get('/user/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
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

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post must have text content' });
    }
    
    const db = getDb();
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

router.post('/:postId/react', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const postId = req.params.postId;
    const { reaction } = req.body;
    const db = getDb();
    
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

router.get('/:postId/reactions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.get('/:postId/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.post('/:postId/comments', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment must have content' });
    }
    
    const db = getDb();
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

router.delete('/:postId/comments/:commentId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await db.collection('comments').deleteOne({
      _id: new ObjectId(req.params.commentId),
      user_id: req.userId
    });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

router.delete('/:postId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

export default router;
