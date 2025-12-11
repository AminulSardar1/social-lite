import { Router } from 'express';
import { getDb, ObjectId } from '../mongodb.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.userId;
    const db = getDb();
    
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

router.put('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { bio, work, location, coverPhotoUrl, avatarUrl, firstName, lastName } = req.body;
    const db = getDb();
    
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
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
