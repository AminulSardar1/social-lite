import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const UPLOAD_DIR = './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      const boundary = req.headers['content-type']?.split('boundary=')[1];
      
      if (!boundary) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      
      const parts = data.toString('binary').split('--' + boundary);
      
      for (const part of parts) {
        if (part.includes('filename=')) {
          const filenameMatch = part.match(/filename="(.+?)"/);
          if (filenameMatch) {
            const originalName = filenameMatch[1];
            const ext = path.extname(originalName);
            const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
            
            const contentStart = part.indexOf('\r\n\r\n') + 4;
            const contentEnd = part.lastIndexOf('\r\n');
            const fileContent = part.substring(contentStart, contentEnd);
            
            fs.writeFileSync(
              path.join(UPLOAD_DIR, filename),
              Buffer.from(fileContent, 'binary')
            );
            
            return res.json({ url: `/uploads/${filename}` });
          }
        }
      }
      
      res.status(400).json({ error: 'No file uploaded' });
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
