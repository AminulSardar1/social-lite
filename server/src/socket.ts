import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getDb, ObjectId } from './mongodb.js';

const JWT_SECRET = process.env.JWT_SECRET || process.env.REPL_ID || 'fallback-secret-key';
const onlineUsers = new Map<string, string>();

async function isConversationParticipant(userId: string, conversationId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.collection('conversation_participants').findOne({
    conversation_id: conversationId,
    user_id: userId
  });
  return !!result;
}

export function setupSocket(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    onlineUsers.set(userId, socket.id);
    io.emit('user_online', userId);

    socket.on('join_conversation', async (conversationId: string) => {
      const isParticipant = await isConversationParticipant(userId, conversationId);
      if (isParticipant) {
        socket.join(`conversation_${conversationId}`);
      }
    });

    socket.on('send_message', async (data: { conversationId: string; content: string }) => {
      try {
        const isParticipant = await isConversationParticipant(userId, data.conversationId);
        if (!isParticipant) {
          return;
        }
        
        const db = getDb();
        const result = await db.collection('messages').insertOne({
          conversation_id: data.conversationId,
          sender_id: userId,
          content: data.content,
          created_at: new Date()
        });
        
        const sender = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        
        io.to(`conversation_${data.conversationId}`).emit('new_message', {
          id: result.insertedId.toString(),
          conversation_id: data.conversationId,
          sender_id: userId,
          content: data.content,
          created_at: new Date(),
          sender: sender ? {
            id: sender._id.toString(),
            first_name: sender.first_name,
            last_name: sender.last_name,
            avatar_url: sender.avatar_url
          } : null,
          reactions: []
        });
      } catch (err) {
        console.error('Error sending message:', err);
      }
    });

    socket.on('react_message', async (data: { messageId: string; conversationId: string; reaction: string | null }) => {
      try {
        const isParticipant = await isConversationParticipant(userId, data.conversationId);
        if (!isParticipant) return;

        const db = getDb();
        
        if (!data.reaction) {
          await db.collection('message_reactions').deleteOne({
            message_id: data.messageId,
            user_id: userId
          });
        } else {
          await db.collection('message_reactions').updateOne(
            { message_id: data.messageId, user_id: userId },
            { $set: { reaction: data.reaction, created_at: new Date() } },
            { upsert: true }
          );
        }

        const reactions = await db.collection('message_reactions').find({
          message_id: data.messageId
        }).toArray();

        io.to(`conversation_${data.conversationId}`).emit('message_reaction_updated', {
          messageId: data.messageId,
          reactions: reactions.map(r => ({ user_id: r.user_id, reaction: r.reaction }))
        });
      } catch (err) {
        console.error('Error reacting to message:', err);
      }
    });

    socket.on('delete_message', async (data: { messageId: string; conversationId: string; forEveryone: boolean }) => {
      try {
        const isParticipant = await isConversationParticipant(userId, data.conversationId);
        if (!isParticipant) return;

        const db = getDb();

        if (data.forEveryone) {
          const msg = await db.collection('messages').findOne({ _id: new ObjectId(data.messageId) });
          if (msg?.sender_id !== userId) return;
          
          await db.collection('message_deletions').updateOne(
            { message_id: data.messageId, user_id: userId },
            { $set: { message_id: data.messageId, user_id: userId, deleted_for_everyone: true } },
            { upsert: true }
          );
          
          io.to(`conversation_${data.conversationId}`).emit('message_deleted', {
            messageId: data.messageId,
            deletedForEveryone: true
          });
        } else {
          await db.collection('message_deletions').updateOne(
            { message_id: data.messageId, user_id: userId },
            { $set: { message_id: data.messageId, user_id: userId, deleted_for_everyone: false } },
            { upsert: true }
          );
          
          socket.emit('message_deleted', {
            messageId: data.messageId,
            deletedForEveryone: false
          });
        }
      } catch (err) {
        console.error('Error deleting message:', err);
      }
    });

    socket.on('typing', (conversationId: string) => {
      socket.to(`conversation_${conversationId}`).emit('user_typing', { userId, conversationId });
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user_offline', userId);
    });
  });
}

export { onlineUsers };
