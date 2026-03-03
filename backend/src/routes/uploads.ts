import HyperExpress from 'hyper-express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function uploadRoutes(app: HyperExpress.Server) {
  // Upload logo (accepts base64 dataURL in JSON body)
  app.post('/api/upload', async (req, res) => {
    try {
      const body = await req.json();
      const { data } = body as { data: string };

      if (!data || !data.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Invalid image data' });
      }

      // Parse dataURL: "data:image/png;base64,iVBOR..."
      const matches = data.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
      if (!matches) {
        return res.status(400).json({ error: 'Invalid data URL format' });
      }

      const mime = matches[1];
      const base64 = matches[2];
      const ext = MIME_TO_EXT[mime];

      if (!ext) {
        return res.status(400).json({ error: `Unsupported image type: ${mime}` });
      }

      const buffer = Buffer.from(base64, 'base64');

      if (buffer.length > MAX_SIZE) {
        return res.status(400).json({ error: 'File too large (max 2MB)' });
      }

      const fileName = `${crypto.randomUUID()}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, buffer);

      res.json({
        url: `/uploads/${fileName}`,
        fileName,
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Serve uploaded files
  app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filename).slice(1);
    const extToMime: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    };

    res.header('Content-Type', extToMime[ext] || 'application/octet-stream');
    res.header('Cache-Control', 'public, max-age=31536000');
    res.send(fs.readFileSync(filePath));
  });
}
