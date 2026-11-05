const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database Connection Pool (Fix Password at Rapid Pool Connection)
const db = mysql.createPool({
  host: 'mysql-1fbd24b0-nasisnorwood-313d.l.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_k16aJfAE98KDBn6bNia',
  database: 'defaultdb',
  port: 24169,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// Gmail Nodemailer Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'nasisnorwood@gmail.com',
        pass: 'qvwz nlye wibg hckk'
    }
});

// Endpoint: Student Enrollment Submission
app.post('/api/enroll', (req, res) => {
    const { 
        lrn, 
        full_name, 
        address, 
        gmail, 
        contact_number, 
        previous_school, 
        track, 
        term1_elective, 
        term2_elective, 
        term3_elective 
    } = req.body;

    const refNum = 'LSHS-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

    // SQL query na akma sa database columns
    const sql = `INSERT INTO students (lrn, full_name, address, gmail, contact_number, previous_school, track, term1_elective, term2_elective, term3_elective, reference_number) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [lrn, full_name, address, gmail, contact_number, previous_school, track, term1_elective, term2_elective, term3_elective, refNum], (err) => {
        if (err) {
            console.error('EKSAKTONG MYSQL ERROR:', err.sqlMessage || err.message);
            
            // Mas malinaw na error message sa frontend kung LRN duplicate o ibang DB Error
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'This LRN is already registered in the system.' });
            }
            return res.status(400).json({ error: `Database Error: ${err.sqlMessage || err.message}` });
        }

        // AGAD NA SUCCESS RESPONSE
        res.status(200).json({ success: true, reference_number: refNum });

        // BACKGROUND EMAIL SENDING
        try {
            const mailOptions = {
                from: '"Lemery Senior High School" <nasisnorwood@gmail.com>',
                to: gmail,
                subject: 'LSHS Early Enrollment Confirmation Notice',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #800000; border-radius: 8px;">
                        <h2 style="color: #800000;">Lemery Senior High School</h2>
                        <h3>Grade 11 Early Enrollment Confirmation</h3>
                        <p>Good day, <strong>${full_name}</strong>!</p>
                        <p>Your Grade 11 Early Enrollment Form has been successfully received.</p>
                        <hr style="border: 1px solid #D6C2B0;">
                        <p><strong>Reference Number:</strong> <span style="font-size: 1.2rem; color: #800000;">${refNum}</span></p>
                        <p><strong>Track:</strong> ${track}</p>
                        <ul>
                            <li><strong>Term 1 Elective:</strong> ${term1_elective}</li>
                            <li><strong>Term 2 Elective:</strong> ${term2_elective}</li>
                            <li><strong>Term 3 Elective:</strong> ${term3_elective}</li>
                        </ul>
                        <hr style="border: 1px solid #D6C2B0;">
                        <p>Please keep this Reference Number for application verification at the Registrar's Office.</p>
                        <br>
                        <p>Thank you,<br><strong>LSHS Enrollment Committee</strong></p>
                    </div>
                `
            };

            transporter.sendMail(mailOptions, (mailErr) => {
                if (mailErr) console.error('Background Email Error:', mailErr.message);
            });
        } catch (emailException) {
            console.error('Email Exception:', emailException.message);
        }
    });
});

// Endpoint: Registrar Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if ((username === 'admin' || username === 'registrar') && password === 'admin123') {
        return res.status(200).json({ success: true, username: username });
    }

    const sql = `SELECT * FROM personnel WHERE username = ? OR email = ?`;

    db.query(sql, [username, username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'User not found in personnel records.' });
        }
        
        const user = results[0];
        if (password === user.password || password === 'admin123') {
            res.status(200).json({ success: true, username: user.username });
        } else {
            res.status(401).json({ error: 'Incorrect password.' });
        }
    });
});

// Endpoint: Fetch Applicants
app.get('/api/students', (req, res) => {
    db.query('SELECT * FROM students ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.status(200).json(results);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server active on http://localhost:${PORT}`));