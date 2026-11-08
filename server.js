
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection error:', err.message);
        return;
    }

    console.log('Connected to Aiven Database!');
    connection.release();
});

// ==========================================
// 2. AUTO-CREATE STUDENTS TABLE
// ==========================================

const createTableQuery = `
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lrn VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    address TEXT,
    gmail VARCHAR(255),
    contact_number VARCHAR(50),
    previous_school VARCHAR(255),
    track VARCHAR(100),
    term1_elective VARCHAR(100),
    term2_elective VARCHAR(100),
    term3_elective VARCHAR(100),
    reference_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;

db.query(createTableQuery, (err) => {
    if (err) {
        console.error('Error creating students table:', err.message);
    } else {
        console.log('Students table is ready!');
    }
});

// ==========================================
// 3. EMAILJS CONFIGURATION
// ==========================================

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

// Send confirmation email using EmailJS REST API
async function sendEnrollmentEmail(student, referenceNumber) {

    const emailData = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,

        template_params: {
            to_email: student.gmail,
            full_name: student.full_name,
            lrn: student.lrn,
            reference_number: referenceNumber,
            track: student.track,
            term1_elective: student.term1_elective,
            term2_elective: student.term2_elective,
            term3_elective: student.term3_elective
        }
    };

    // Optional EmailJS private key
    if (EMAILJS_PRIVATE_KEY) {
        emailData.accessToken = EMAILJS_PRIVATE_KEY;
    }

    const response = await fetch(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        }
    );

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(
            `EmailJS Error (${response.status}): ${responseText}`
        );
    }

    console.log('Enrollment confirmation email sent:', responseText);

    return true;
}

// ==========================================
// 4. HOME PAGE
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 5. STUDENT ENROLLMENT SUBMISSION
// ==========================================

app.post('/api/enroll', (req, res) => {

    const {
        lrn,
        full_name,
        address,
        gmail,
        email,
        contact_number,
        previous_school,
        track,
        term1_elective,
        term2_elective,
        term3_elective
    } = req.body;

    const recipientEmail = gmail || email;

    // Basic validation
    if (
        !lrn ||
        !full_name ||
        !recipientEmail ||
        typeof recipientEmail !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
    ) {
        return res.status(400).json({
            error: 'Please provide a valid LRN, full name, and Gmail address.'
        });
    }

    // Check EmailJS configuration
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY
    ) {
        console.error('EmailJS environment variables are incomplete.');

        return res.status(500).json({
            error: 'Email notification service is not configured.'
        });
    }

    const refNum =
        'LSHS-' +
        new Date().getFullYear() +
        '-' +
        crypto.randomInt(1000, 10000);

    const student = {
        lrn,
        full_name,
        address,
        gmail: recipientEmail,
        contact_number,
        previous_school,
        track,
        term1_elective,
        term2_elective,
        term3_elective
    };

    const sql = `
        INSERT INTO students (
            lrn,
            full_name,
            address,
            gmail,
            contact_number,
            previous_school,
            track,
            term1_elective,
            term2_elective,
            term3_elective,
            reference_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        student.lrn,
        student.full_name,
        student.address,
        student.gmail,
        student.contact_number,
        student.previous_school,
        student.track,
        student.term1_elective,
        student.term2_elective,
        student.term3_elective,
        refNum
    ];

    db.query(sql, values, async (err) => {

        if (err) {

            console.error('MYSQL ERROR:', err.message);

            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    error: 'This LRN is already registered in the system.'
                });
            }

            return res.status(500).json({
                error: 'Unable to save enrollment information.'
            });
        }

        // Send confirmation email after successful database insertion
        try {

            await sendEnrollmentEmail(student, refNum);

            return res.status(200).json({
                success: true,
                email_sent: true,
                message: 'Enrollment submitted and confirmation email sent successfully.',
                reference_number: refNum
            });

        } catch (mailErr) {

            console.error('EMAIL NOTIFICATION ERROR:', mailErr.message);

            // Registration remains saved even if email delivery fails
            return res.status(200).json({
                success: true,
                email_sent: false,
                message: 'Enrollment saved, but email notification could not be sent.',
                reference_number: refNum
            });
        }
    });
});

// ==========================================
// 6. REGISTRAR LOGIN
// ==========================================

app.post('/api/login', (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            error: 'Username and password are required.'
        });
    }

    const sql = `
        SELECT * FROM personnel
        WHERE username = ? OR email = ?
    `;

    db.query(sql, [username, username], (err, results) => {

        if (err) {
            console.error('LOGIN DATABASE ERROR:', err.message);

            return res.status(500).json({
                error: 'Login service temporarily unavailable.'
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                error: 'User not found in personnel records.'
            });
        }

        const user = results[0];

        // Existing personnel password comparison
        // Use securely hashed passwords before handling real student records.
        if (password === user.password) {

            return res.status(200).json({
                success: true,
                username: user.username
            });

        } else {

            return res.status(401).json({
                error: 'Incorrect password.'
            });
        }
    });
});

// ==========================================
// 7. FETCH APPLICANTS
// ==========================================

app.get('/api/students', (req, res) => {

    db.query(
        'SELECT * FROM students ORDER BY created_at DESC',
        (err, results) => {

            if (err) {
                console.error('FETCH STUDENTS ERROR:', err.message);

                return res.status(500).json({
                    error: 'Unable to retrieve student records.'
                });
            }

            res.status(200).json(results);
        }
    );
});

// ==========================================
// 8. START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server active on port ${PORT}`);
});
