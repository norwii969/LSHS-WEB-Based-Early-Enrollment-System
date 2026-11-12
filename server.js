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

// Temporary in-memory store for Student OTPs
const otpStore = new Map();

// Security stores for Personnel Login (Rate Limiting + Active Sessions)
const loginAttempts = new Map();
const activeAdminSessions = new Set();

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================

const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-1fbd24b0-nasisnorwood-313d.l.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_URyxcYzwRckUVqVhsu3',
    database: process.env.DB_NAME || 'defaultdb',
    port: Number(process.env.DB_PORT || 24169),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

const promiseDB = db.promise();

// ==========================================
// 2. CREATE AND CHECK TABLES (STUDENTS, PERSONNEL, REQUESTS)
// ==========================================

async function initializeDatabase() {
    // A. Create Students Table
    const createStudentsTableQuery = `
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
            status VARCHAR(50) DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    await promiseDB.query(createStudentsTableQuery);

    const requiredColumns = {
        lrn: 'VARCHAR(50) NULL',
        full_name: 'VARCHAR(255) NULL',
        address: 'TEXT NULL',
        gmail: 'VARCHAR(255) NULL',
        contact_number: 'VARCHAR(50) NULL',
        previous_school: 'VARCHAR(255) NULL',
        track: 'VARCHAR(100) NULL',
        term1_elective: 'VARCHAR(100) NULL',
        term2_elective: 'VARCHAR(100) NULL',
        term3_elective: 'VARCHAR(100) NULL',
        reference_number: 'VARCHAR(100) NULL',
        status: "VARCHAR(50) DEFAULT 'Pending'",
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    };

    for (const [column, definition] of Object.entries(requiredColumns)) {
        const [existingColumns] = await promiseDB.query(
            'SHOW COLUMNS FROM students LIKE ?',
            [column]
        );

        if (existingColumns.length === 0) {
            await promiseDB.query(
                `ALTER TABLE students ADD COLUMN \`${column}\` ${definition}`
            );
            console.log(`Added missing column: ${column}`);
        }
    }

    // B. Create Personnel Table for Registrar Login
    const createPersonnelTableQuery = `
        CREATE TABLE IF NOT EXISTS personnel (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    await promiseDB.query(createPersonnelTableQuery);

    // C. Create Correction Requests Table
    const createRequestsTableQuery = `
        CREATE TABLE IF NOT EXISTS correction_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            reference_number VARCHAR(100) NOT NULL,
            lrn VARCHAR(50) NOT NULL,
            notes TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await promiseDB.query(createRequestsTableQuery);

    // D. Auto-insert default personnel accounts if empty
    const [existingPersonnel] = await promiseDB.query('SELECT COUNT(*) AS count FROM personnel');
    if (existingPersonnel[0].count === 0) {
        const insertDefaultPersonnel = `
            INSERT INTO personnel (username, email, password, full_name)
            VALUES 
            ('admin', 'admin@lshs.edu.ph', 'admin123', 'School Administrator'),
            ('registrar', 'registrar@lshs.edu.ph', 'admin123', 'LSHS Registrar Office')
        `;
        await promiseDB.query(insertDefaultPersonnel);
        console.log('Default personnel accounts created (admin/registrar)!');
    }

    console.log('Database tables ready in Aiven Database!');
}

// ==========================================
// 3. EMAILJS CONFIGURATION
// ==========================================

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

async function sendEnrollmentEmail(student, referenceNumber) {
    if (
        !EMAILJS_SERVICE_ID ||
        !EMAILJS_TEMPLATE_ID ||
        !EMAILJS_PUBLIC_KEY
    ) {
        throw new Error('EmailJS environment variables are incomplete.');
    }

    const emailData = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,

        template_params: {
            to_email: student.gmail,
            full_name: student.full_name,
            lrn: student.lrn,
            reference_number: referenceNumber,
            track: student.track || '',
            term1_elective: student.term1_elective || '',
            term2_elective: student.term2_elective || '',
            term3_elective: student.term3_elective || ''
        }
    };

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
// 5. STUDENT ENROLLMENT
// ==========================================

async function handleEnrollment(req, res) {
    try {
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
        } = req.body || {};

        const recipientEmail = gmail || email;

        if (
            !lrn ||
            !full_name ||
            !recipientEmail ||
            typeof recipientEmail !== 'string' ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
        ) {
            return res.status(400).json({
                error: 'Please provide a valid LRN, full name, and email address.'
            });
        }

        const student = {
            lrn: String(lrn).trim(),
            full_name: String(full_name).trim(),
            address: address || '',
            gmail: recipientEmail.trim(),
            contact_number: contact_number || '',
            previous_school: previous_school || '',
            track: track || '',
            term1_elective: term1_elective || '',
            term2_elective: term2_elective || '',
            term3_elective: term3_elective || ''
        };

        const referenceNumber =
            'LSHS-' +
            new Date().getFullYear() +
            '-' +
            crypto.randomInt(1000, 10000);

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
                reference_number,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
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
            referenceNumber
        ];

        await promiseDB.query(sql, values);
        console.log('ENROLLMENT SAVED:', referenceNumber);

        try {
            await sendEnrollmentEmail(
                student,
                referenceNumber
            );

            return res.status(200).json({
                success: true,
                email_sent: true,
                message: 'Enrollment submitted successfully. Confirmation email sent.',
                reference_number: referenceNumber
            });
        } catch (mailErr) {
            console.error('EMAIL NOTIFICATION ERROR:', mailErr.message);

            return res.status(200).json({
                success: true,
                email_sent: false,
                message: 'Enrollment saved, but email notification could not be sent.',
                reference_number: referenceNumber
            });
        }
    } catch (err) {
        console.error('ENROLLMENT DATABASE ERROR:', {
            code: err.code,
            message: err.message,
            sqlMessage: err.sqlMessage
        });

        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                error: 'This LRN is already registered in the system.'
            });
        }

        return res.status(500).json({
            error: 'Unable to save enrollment information.',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

app.post('/api/enroll', handleEnrollment);
app.post('/enroll', handleEnrollment);

// ==========================================
// 5.1 CORRECTION REQUESTS
// ==========================================

app.post('/api/requests', async (req, res) => {
    const { reference_number, lrn, notes } = req.body || {};

    try {
        const [students] = await promiseDB.query(
            'SELECT * FROM students WHERE reference_number = ? AND lrn = ?',
            [reference_number, lrn]
        );
        if (students.length === 0) {
            return res.status(404).json({ error: 'Reference Number or LRN does not match our records.' });
        }

        const student = students[0];
        const sql = 'INSERT INTO correction_requests (student_id, reference_number, lrn, notes) VALUES (?, ?, ?, ?)';
        await promiseDB.query(sql, [student.id, reference_number, lrn, notes]);

        res.status(200).json({ success: true, message: 'Correction request submitted successfully.' });
    } catch (err) {
        console.error('SUBMIT REQUEST ERROR:', err.message);
        res.status(500).json({ error: 'Database request failed.' });
    }
});

app.get('/api/requests', async (req, res) => {
    try {
        const sql = `
            SELECT r.*, s.full_name AS student_name 
            FROM correction_requests r 
            JOIN students s ON r.student_id = s.id 
            ORDER BY r.created_at DESC
        `;
        const [rows] = await promiseDB.query(sql);
        res.status(200).json(rows);
    } catch (err) {
        console.error('FETCH REQUESTS ERROR:', err.message);
        res.status(500).json({ error: 'Failed to fetch correction requests.' });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        await promiseDB.query('DELETE FROM correction_requests WHERE id = ?', [req.params.id]);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('DELETE REQUEST ERROR:', err.message);
        res.status(500).json({ error: 'Failed to delete request.' });
    }
});

// ==========================================
// 5.2 STUDENT OTP SELF-EDIT VERIFICATION
// ==========================================

app.post('/api/student/send-otp', async (req, res) => {
    const { reference_number } = req.body || {};
    if (!reference_number) {
        return res.status(400).json({ error: 'Reference Number is required.' });
    }

    try {
        const [rows] = await promiseDB.query(
            'SELECT * FROM students WHERE reference_number = ?',
            [reference_number.trim()]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reference Number not found in our records.' });
        }

        const student = rows[0];
        const otp = String(crypto.randomInt(100000, 1000000));
        const expiresAt = Date.now() + 10 * 60 * 1000;

        otpStore.set(student.reference_number, { otp, expiresAt });

        const emailData = {
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: student.gmail,
                full_name: student.full_name,
                lrn: student.lrn,
                reference_number: `SECURITY OTP CODE: ${otp} (Valid for 10 mins)`,
                track: student.track || '',
                term1_elective: student.term1_elective || '',
                term2_elective: student.term2_elective || '',
                term3_elective: student.term3_elective || ''
            }
        };

        if (EMAILJS_PRIVATE_KEY) {
            emailData.accessToken = EMAILJS_PRIVATE_KEY;
        }

        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            throw new Error('Failed to deliver OTP email.');
        }

        const parts = student.gmail.split('@');
        const maskedEmail = parts[0].slice(0, 2) + '***@' + parts[1];

        res.status(200).json({ success: true, masked_email: maskedEmail });
    } catch (err) {
        console.error('SEND OTP ERROR:', err.message);
        res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
});

app.post('/api/student/verify-otp', async (req, res) => {
    const { reference_number, otp } = req.body || {};
    const record = otpStore.get(String(reference_number).trim());

    if (!record || record.otp !== String(otp).trim() || Date.now() > record.expiresAt) {
        return res.status(401).json({ error: 'Invalid or expired OTP code.' });
    }

    try {
        const [rows] = await promiseDB.query(
            'SELECT * FROM students WHERE reference_number = ?',
            [String(reference_number).trim()]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Student record not found.' });
        }

        res.status(200).json({ success: true, student: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Database error during verification.' });
    }
});

app.put('/api/student/self-update', async (req, res) => {
    const { reference_number, otp, lrn, full_name, address, contact_number, previous_school } = req.body || {};
    const record = otpStore.get(String(reference_number).trim());

    if (!record || record.otp !== String(otp).trim() || Date.now() > record.expiresAt) {
        return res.status(401).json({ error: 'Session expired. Please request a new OTP.' });
    }

    try {
        const sql = `
            UPDATE students 
            SET lrn = ?, full_name = ?, address = ?, contact_number = ?, previous_school = ?
            WHERE reference_number = ?
        `;
        await promiseDB.query(sql, [
            String(lrn).trim(),
            String(full_name).trim(),
            address || '',
            contact_number || '',
            previous_school || '',
            String(reference_number).trim()
        ]);

        otpStore.delete(String(reference_number).trim());

        res.status(200).json({ success: true, message: 'Enrollment details updated.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'This LRN is already registered to another student.' });
        }
        res.status(500).json({ error: 'Failed to update enrollment record.' });
    }
});

// ==========================================
// 6. SECURE REGISTRAR LOGIN
// ==========================================

function verifyAdminSession(req, res, next) {
    const authHeader = req.headers['x-admin-token'];
    if (!authHeader || !activeAdminSessions.has(authHeader)) {
        return res.status(403).json({ error: 'Unauthorized: Valid Personnel session required.' });
    }
    next();
}

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({
            error: 'Username and password are required.'
        });
    }

    const attemptKey = String(username).trim().toLowerCase();
    const currentAttempt = loginAttempts.get(attemptKey);

    if (currentAttempt && currentAttempt.lockUntil && Date.now() < currentAttempt.lockUntil) {
        const remainingMinutes = Math.ceil((currentAttempt.lockUntil - Date.now()) / 60000);
        return res.status(429).json({
            error: `Account temporarily locked due to multiple failed attempts. Try again in ${remainingMinutes} minute(s).`
        });
    }

    const sql = `
        SELECT * FROM personnel
        WHERE username = ? OR email = ?
    `;

    db.query(sql, [username.trim(), username.trim()], (err, results) => {
        if (err) {
            console.error('LOGIN DATABASE ERROR:', err.message);
            return res.status(500).json({
                error: 'Login service temporarily unavailable.'
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                error: 'Invalid credentials.'
            });
        }

        const user = results[0];

        if (password === user.password) {
            loginAttempts.delete(attemptKey);

            const sessionToken = crypto.randomBytes(24).toString('hex');
            activeAdminSessions.add(sessionToken);

            return res.status(200).json({
                success: true,
                username: user.username,
                token: sessionToken
            });
        } else {
            const count = (currentAttempt ? currentAttempt.count : 0) + 1;
            if (count >= 3) {
                loginAttempts.set(attemptKey, { count, lockUntil: Date.now() + 5 * 60 * 1000 });
                return res.status(429).json({
                    error: 'Too many failed login attempts (3/3). Login locked for 5 minutes.'
                });
            } else {
                loginAttempts.set(attemptKey, { count, lockUntil: null });
                return res.status(401).json({
                    error: `Incorrect password. (${3 - count} attempt(s) remaining before lockout)`
                });
            }
        }
    });
});

app.post('/api/logout', (req, res) => {
    const token = req.headers['x-admin-token'];
    if (token) activeAdminSessions.delete(token);
    res.status(200).json({ success: true });
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
// 7.1 APPROVE STUDENT & SEND GMAIL NOTIFICATION
// ==========================================

app.put('/api/students/:id/approve', verifyAdminSession, async (req, res) => {
    const studentId = req.params.id;

    try {
        const [rows] = await promiseDB.query('SELECT * FROM students WHERE id = ?', [studentId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Student record not found.' });
        }

        const student = rows[0];

        // Update status to Approved in database
        await promiseDB.query("UPDATE students SET status = 'Approved' WHERE id = ?", [studentId]);

        // Send Official Acceptance Email via EmailJS
        const emailData = {
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
                to_email: student.gmail,
                full_name: student.full_name,
                lrn: student.lrn,
                reference_number: `${student.reference_number} — OFFICIALLY APPROVED & ACCEPTED`,
                track: student.track || '',
                term1_elective: student.term1_elective || '',
                term2_elective: student.term2_elective || '',
                term3_elective: student.term3_elective || ''
            }
        };

        if (EMAILJS_PRIVATE_KEY) {
            emailData.accessToken = EMAILJS_PRIVATE_KEY;
        }

        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            return res.status(200).json({
                success: true,
                message: 'Student marked as Approved, but email notification could not be sent.'
            });
        }

        res.status(200).json({
            success: true,
            message: `${student.full_name} is now officially APPROVED and notified via Gmail!`
        });
    } catch (err) {
        console.error('APPROVE STUDENT ERROR:', err.message);
        res.status(500).json({ error: 'Failed to approve student application.' });
    }
});

// ==========================================
// 8. UPDATE / EDIT STUDENT APPLICANT RECORD
// ==========================================

app.put('/api/students/:id', verifyAdminSession, async (req, res) => {
    const studentId = req.params.id;
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
    } = req.body || {};

    if (!lrn || !full_name || !gmail) {
        return res.status(400).json({ error: 'LRN, full name, and gmail are required.' });
    }

    const sql = `
        UPDATE students 
        SET lrn = ?, full_name = ?, address = ?, gmail = ?, contact_number = ?, previous_school = ?, track = ?, term1_elective = ?, term2_elective = ?, term3_elective = ?
        WHERE id = ?
    `;

    const values = [
        String(lrn).trim(),
        String(full_name).trim(),
        address || '',
        String(gmail).trim(),
        contact_number || '',
        previous_school || '',
        track || '',
        term1_elective || '',
        term2_elective || '',
        term3_elective || '',
        studentId
    ];

    try {
        await promiseDB.query(sql, values);
        res.status(200).json({ success: true, message: 'Student record updated successfully.' });
    } catch (err) {
        console.error('UPDATE STUDENT ERROR:', err.message);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Another student is already using this LRN.' });
        }
        res.status(500).json({ error: 'Unable to update student record.' });
    }
});

// ==========================================
// 9. UPDATE PERSONNEL CREDENTIALS
// ==========================================

app.put('/api/admin/credentials', verifyAdminSession, async (req, res) => {
    const { old_password, new_username, new_password } = req.body || {};

    if (!old_password || !new_username || !new_password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    if (new_password.trim().length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    try {
        const [rows] = await promiseDB.query('SELECT * FROM personnel LIMIT 1');
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Personnel record not found.' });
        }

        const currentPersonnel = rows[0];

        if (currentPersonnel.password !== old_password) {
            return res.status(401).json({ error: 'Incorrect current password.' });
        }

        const updateSql = 'UPDATE personnel SET username = ?, password = ? WHERE id = ?';
        await promiseDB.query(updateSql, [new_username.trim(), new_password.trim(), currentPersonnel.id]);

        res.status(200).json({ success: true, message: 'Personnel credentials updated successfully.' });
    } catch (err) {
        console.error('UPDATE CREDENTIALS ERROR:', err.message);
        res.status(500).json({ error: 'Failed to update credentials.' });
    }
});

// ==========================================
// 10. DELETE STUDENT APPLICANT
// ==========================================

app.delete('/api/students/:id', verifyAdminSession, (req, res) => {
    const studentId = req.params.id;

    const sql = 'DELETE FROM students WHERE id = ?';

    db.query(sql, [studentId], (err, result) => {
        if (err) {
            console.error('DELETE STUDENT ERROR:', err.message);
            return res.status(500).json({ error: 'Unable to delete student record.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Student record not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Student record deleted successfully.'
        });
    });
});

// ==========================================
// 11. START SERVER
// ==========================================

async function startServer() {
    try {
        await initializeDatabase();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server active on port ${PORT}`);
        });
    } catch (err) {
        console.error('SERVER STARTUP / DATABASE ERROR:', err.message);
        process.exit(1);
    }
}

startServer();