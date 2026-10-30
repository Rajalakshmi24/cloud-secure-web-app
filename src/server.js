require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecure-jwt-capstone-secret';

// PostgreSQL Connection Pool (Uses Private RDS Subnet)
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'cloudmart',
  port: process.env.DB_PORT || 5432,
});

// Initialize Database Tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10, 2) NOT NULL,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[DB] Database tables initialized successfully.');
  } catch (err) {
    console.error('[DB] Error initializing database tables:', err.message);
  }
}
initDB();

// ----------------- Security Middleware -----------------
app.use(helmet()); // Sets standard security headers (X-Frame-Options, CSP, etc.)
app.use(express.json());

// API Rate Limiting (Brute-Force & DoS mitigation)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 requests per IP per window
  message: { error: 'Too many login attempts. Please try again later.' },
});

// ----------------- Auth & RBAC Middleware -----------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied: Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin privileges required' });
  }
  next();
}

// ----------------- System & Health Routes -----------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ----------------- Authentication Routes -----------------
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const assignedRole = role === 'admin' ? 'admin' : 'user';

    // Parameterized query blocks SQL Injection
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, passwordHash, assignedRole]
    );

    res.status(201).json({ message: 'User registered', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------- Product CRUD Routes -----------------
// Read all products (Public)
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch products' });
  }
});

// Create product (Admin Only)
app.post('/api/products', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, price, stock, image_url } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, description, price, stock, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price, stock || 0, image_url || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create product' });
  }
});

// Update product (Admin Only)
app.put('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, price, stock } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name = $1, price = $2, stock = $3 WHERE id = $4 RETURNING *',
      [name, price, stock, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update product' });
  }
});

// Delete product (Admin Only)
app.delete('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete product' });
  }
});

// ----------------- Admin Dashboard Route -----------------
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    const productCount = await pool.query('SELECT COUNT(*) FROM products');

    res.json({
      totalUsers: parseInt(userCount.rows[0].count, 10),
      totalProducts: parseInt(productCount.rows[0].count, 10),
      status: 'operational',
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch admin statistics' });
  }
});

app.listen(PORT, () => {
  console.log(`[CloudMart] Server listening on port ${PORT}`);
});