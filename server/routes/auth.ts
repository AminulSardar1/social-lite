import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../mongodb.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || process.env.REPL_ID || 'fallback-secret-key';

router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, dateOfBirth, gender } = req.body;
    
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const db = getDb();
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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const db = getDb();
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

export default router;
