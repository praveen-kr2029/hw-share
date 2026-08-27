require('dotenv').config();
const express = require('express');
const db = require('./db');
const upload = require('./uploadConfig');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Middleware: Admin verification check
const checkAdmin = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Access denied: Admin secret invalid or missing.' });
  }
  next();
};

// Admin Key Verification Endpoint
app.post('/api/admin/verify', (req, res) => {
  const { secret } = req.body;
  if (secret && secret === process.env.ADMIN_SECRET) {
    return res.json({ success: true, message: 'Admin verified successfully' });
  }
  return res.status(401).json({ error: 'Invalid Admin Secret Key' });
});

// Fetch All Assignments (Public access)
app.get('/api/assignments', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM assignments ORDER BY uploaded_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected Upload Assignment (Admin only)
app.post('/api/upload', checkAdmin, upload.single('file'), async (req, res) => {
  try {
    const { title, subject } = req.body;
    if (!title || !subject || !req.file) {
      return res.status(400).json({ error: 'Title, subject, and file are required.' });
    }

    const fileUrl = req.file.path;
    const publicId = req.file.filename;

    const [result] = await db.execute(
      'INSERT INTO assignments (title, subject, file_url, public_id) VALUES (?, ?, ?, ?)',
      [title, subject, fileUrl, publicId]
    );

    res.status(201).json({
      message: 'Assignment uploaded successfully',
      id: result.insertId,
      title,
      subject,
      file_url: fileUrl
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'Server upload failed' });
  }
});

// Protected Delete Assignment (Admin only)
app.delete('/api/assignments/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute('SELECT public_id FROM assignments WHERE id = ?', [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });

    const publicId = rows[0].public_id;
    if (publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    await db.execute('DELETE FROM assignments WHERE id = ?', [id]);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));