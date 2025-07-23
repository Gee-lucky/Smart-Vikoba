const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const PORT = 5500;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

const db = new sqlite3.Database('./vikoba.db', (err) => {
  if (err) console.error('Failed to connect to DB:', err.message);
  else console.log('Connected to SQLite DB.');
});

// Create Tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

 db.run(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT DEFAULT 'Member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);


  db.run(`
    CREATE TABLE IF NOT EXISTS contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(member_id) REFERENCES members(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(member_id) REFERENCES members(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS savings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      amount REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(member_id) REFERENCES members(id)
    )
  `);
});

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Registration
app.post('/api/register', async (req, res) => {
  const { fullName, email, password, confirmPassword, termsAccepted } = req.body;

  if (!fullName || !email || !password || !confirmPassword)
    return res.status(400).json({ message: 'All fields are required.' });

  if (!isValidEmail(email))
    return res.status(400).json({ message: 'Invalid email format.' });

  if (password !== confirmPassword)
    return res.status(400).json({ message: 'Passwords do not match.' });

  if (!termsAccepted)
    return res.status(400).json({ message: 'You must accept the terms.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      `INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)`,
      [fullName, email, hashedPassword],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'User already exists.' });
          }
          console.error(err.message);
          return res.status(500).json({ message: 'Server error. Try again.' });
        }
        res.status(201).json({ message: 'Account created successfully!' });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ message: 'Server error. Try again.' });
    }

    if (!row) return res.status(401).json({ message: 'Invalid email or password.' });

    bcrypt.compare(password, row.password)
      .then(match => {
        if (!match)
          return res.status(401).json({ message: 'Invalid email or password.' });

        res.status(200).json({ message: 'Login successful!' });
      })
      .catch(err => {
        console.error(err);
        res.status(500).json({ message: 'Server error. Try again.' });
      });
  });
});

// Members CRUD
// Get all members
app.get('/api/members', (req, res) => {
  db.all(`SELECT * FROM members`, [], (err, rows) => {
    if (err) {
      console.error('Error fetching members:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add new member
app.post('/api/members', (req, res) => {
  const { full_name, email, phone, role } = req.body;

  db.run(
    `INSERT INTO members (full_name, email, phone, role) VALUES (?, ?, ?, ?)`,
    [full_name, email, phone, role || 'Member'],
    function (err) {
      if (err) {
        console.error('Error adding member:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Member added!', id: this.lastID });
    }
  );
});

// Update member
app.put('/api/members/:id', (req, res) => {
  const { full_name, email, phone, role } = req.body;

  db.run(
    `UPDATE members SET full_name = ?, email = ?, phone = ?, role = ? WHERE id = ?`,
    [full_name, email, phone, role || 'Member', req.params.id],
    function (err) {
      if (err) {
        console.error('Error updating member:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Member updated!' });
    }
  );
});

// Delete member
app.delete('/api/members/:id', (req, res) => {
  db.run(`DELETE FROM members WHERE id = ?`, [req.params.id], function (err) {
    if (err) {
      console.error('Error deleting member:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Member deleted!' });
  });
});


// Contributions CRUD
app.get('/api/contributions', (req, res) => {
  db.all(`SELECT c.*, m.full_name FROM contributions c JOIN members m ON c.member_id = m.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/contributions', (req, res) => {
  const { member_id, amount } = req.body;
  db.run(`INSERT INTO contributions (member_id, amount) VALUES (?, ?)`,
    [member_id, amount], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Contribution added!', id: this.lastID });
    });
});

app.delete('/api/contributions/:id', (req, res) => {
  db.run(`DELETE FROM contributions WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Contribution deleted!' });
  });
});

// Loans CRUD
app.get('/api/loans', (req, res) => {
  db.all(`SELECT l.*, m.full_name FROM loans l JOIN members m ON l.member_id = m.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/loans', (req, res) => {
  const { member_id, amount } = req.body;
  db.run(`INSERT INTO loans (member_id, amount) VALUES (?, ?)`,
    [member_id, amount], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Loan recorded!', id: this.lastID });
    });
});

app.delete('/api/loans/:id', (req, res) => {
  db.run(`DELETE FROM loans WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Loan deleted!' });
  });
});

// Savings CRUD
app.get('/api/savings', (req, res) => {
  db.all(`SELECT s.*, m.full_name FROM savings s JOIN members m ON s.member_id = m.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/savings', (req, res) => {
  const { member_id, amount } = req.body;
  db.run(`INSERT INTO savings (member_id, amount) VALUES (?, ?)`,
    [member_id, amount], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Saving recorded!', id: this.lastID });
    });
});

app.delete('/api/savings/:id', (req, res) => {
  db.run(`DELETE FROM savings WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Saving deleted!' });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}`);
});
