import { MongoClient, Db, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || '';

let client: MongoClient;
let db: Db;

export async function connectMongoDB(): Promise<Db> {
  if (db) return db;
  
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

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected');
  }
  return db;
}

export { ObjectId };
