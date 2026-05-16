const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

const newUsername = 'admin_new';
const newPassword = 'Admin@123';
const name = 'Recovery Admin';

async function reset() {
    const hash = await bcrypt.hash(newPassword, 10);
    const id = 'u' + Date.now();
    const initials = 'RA';
    
    db.run('INSERT INTO users (id, name, username, hash, role, initials) VALUES (?, ?, ?, ?, ?, ?)', 
        [id, name, newUsername, hash, 'admin', initials], (err) => {
            if (err) {
                console.error("Failed to create recovery admin. Maybe username exists?");
                console.error(err.message);
            } else {
                console.log("==========================================");
                console.log("RECOVERY ADMIN CREATED SUCCESSFULLY");
                console.log("Username: " + newUsername);
                console.log("Password: " + newPassword);
                console.log("==========================================");
                console.log("Please delete this script after use!");
            }
            db.close();
        });
}

reset();
