import { Router } from 'express';
import { getDb, ObjectId } from '../mongodb.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/conversations', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.get('/conversation/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.get('/conversation/:id/info', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const userId = req.userId!;
    
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

router.post('/conversation/start/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const targetId = req.params.userId;
    const db = getDb();
    
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

router.post('/conversation/group', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, userIds } = req.body;
    const db = getDb();
    
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

router.put('/conversation/:id/name', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    const db = getDb();
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { name } }
    );
    res.json({ message: 'Group name updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group name' });
  }
});

router.put('/conversation/:id/photo', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { photoUrl } = req.body;
    const db = getDb();
    await db.collection('conversations').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { photo_url: photoUrl } }
    );
    res.json({ message: 'Group photo updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update group photo' });
  }
});

router.post('/conversation/:id/members', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;
    const db = getDb();
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

router.delete('/conversation/:id/members/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await db.collection('conversation_participants').deleteOne({
      conversation_id: req.params.id,
      user_id: req.params.userId
    });
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.post('/conversation/:id/leave', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    await db.collection('conversation_participants').deleteOne({
      conversation_id: req.params.id,
      user_id: req.userId
    });
    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

router.put('/conversation/:id/mute', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { muted } = req.body;
    const db = getDb();
    await db.collection('conversation_participants').updateOne(
      { conversation_id: req.params.id, user_id: req.userId },
      { $set: { is_muted: muted } }
    );
    res.json({ message: muted ? 'Muted' : 'Unmuted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mute status' });
  }
});

router.put('/conversation/:id/nickname', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, nickname } = req.body;
    const db = getDb();
    await db.collection('conversation_participants').updateOne(
      { conversation_id: req.params.id, user_id: userId },
      { $set: { nickname } }
    );
    res.json({ message: 'Nickname updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update nickname' });
  }
});

router.post('/message/:id/reaction', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { reaction } = req.body;
    const db = getDb();
    
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

router.delete('/message/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { forEveryone } = req.body;
    const db = getDb();
    
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

export default router;
