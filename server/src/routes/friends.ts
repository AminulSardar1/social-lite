import { Router } from 'express';
import { getDb, ObjectId } from '../mongodb.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, async (req: AuthRequest, res) => {
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

router.get('/requests', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.get('/suggestions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.post('/suggestions/hide/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.post('/request/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    const db = getDb();
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

router.post('/accept/:requestId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.post('/decline/:requestId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await db.collection('friendships').deleteOne({
      _id: new ObjectId(req.params.requestId),
      addressee_id: req.userId
    });
    res.json({ message: 'Friend request declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

router.delete('/:friendId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.post('/block/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const targetId = req.params.userId;
    const db = getDb();
    
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

router.delete('/block/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await db.collection('user_blocks').deleteOne({
      blocker_id: req.userId,
      blocked_id: req.params.userId
    });
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

export default router;
