const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      prior_arches INTEGER DEFAULT 0,
      prior_implants INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      date TEXT NOT NULL,
      case_id TEXT DEFAULT '',
      procedures JSONB DEFAULT '[]',
      num_implants INTEGER DEFAULT 0,
      num_extractions INTEGER DEFAULT 0,
      immediate_placement BOOLEAN DEFAULT FALSE,
      immediate_load TEXT DEFAULT 'no',
      no_load_reasons JSONB DEFAULT '[]',
      notes TEXT DEFAULT '',
      prosthetic_workflow JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── Students ──────────────────────────────────────────────────────────────────
app.get('/api/students', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM students ORDER BY name');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/students', async (req, res) => {
  try {
    const { name, prior_arches, prior_implants } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(`
      INSERT INTO students (id, name, prior_arches, prior_implants)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET
        prior_arches = EXCLUDED.prior_arches,
        prior_implants = EXCLUDED.prior_implants
      RETURNING *
    `, [Date.now().toString(), name.trim(),
        parseInt(prior_arches) || 0, parseInt(prior_implants) || 0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cases ─────────────────────────────────────────────────────────────────────
app.get('/api/cases', async (req, res) => {
  try {
    const { student, startDate, endDate } = req.query;
    let query = 'SELECT * FROM cases WHERE 1=1';
    const params = [];
    if (student)   { params.push(student);   query += ` AND student_name = $${params.length}`; }
    if (startDate) { params.push(startDate); query += ` AND date >= $${params.length}`; }
    if (endDate)   { params.push(endDate);   query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY date DESC, created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cases', async (req, res) => {
  try {
    const {
      student_name, date, case_id, procedures, num_implants, num_extractions,
      immediate_placement, immediate_load, no_load_reasons, notes, prosthetic_workflow,
    } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO cases
        (id, student_name, date, case_id, procedures, num_implants, num_extractions,
         immediate_placement, immediate_load, no_load_reasons, notes, prosthetic_workflow)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [Date.now().toString(), student_name, date, case_id || '',
        JSON.stringify(procedures || []),
        parseInt(num_implants) || 0, parseInt(num_extractions) || 0,
        !!immediate_placement, immediate_load || 'no',
        JSON.stringify(no_load_reasons || []),
        notes || '',
        JSON.stringify(prosthetic_workflow || [])]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cases/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => app.listen(PORT, () => console.log(`\n  Implant Case Tracker → http://localhost:${PORT}\n`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
