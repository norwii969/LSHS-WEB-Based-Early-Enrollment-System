CREATE DATABASE IF NOT EXISTS lemery_enrollment;
USE lemery_enrollment;

CREATE TABLE IF NOT EXISTS personnel (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lrn VARCHAR(12) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    gmail VARCHAR(255) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    previous_school VARCHAR(255) NOT NULL,
    track VARCHAR(100) NOT NULL,
    reference_number VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO personnel (username, email, password) 
VALUES ('registrar', 'registrar@lshs.edu.ph', 'admin123')
ON DUPLICATE KEY UPDATE id=id;