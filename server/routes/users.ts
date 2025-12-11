import { Router } from 'express';
import { getDb, ObjectId } from '../mongodb.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

router.get('/search', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const db = getDb();
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

router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
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

export default router;
