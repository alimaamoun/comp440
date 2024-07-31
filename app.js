const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true
}));

//get html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

//connect to database securely so I don't leak my password
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});
//check connection
db.connect((err) => {
    if (err) {
        console.error('Connection error: ' + err.stack);
        return;
    }
    console.log('Connected to the database');
});
app.post('/register', (req, res) => {
    const { reg_username, reg_password, reg_passwordCheck, reg_email, reg_firstName, reg_lastName } = req.body;
    //check if passwords match
    if (reg_password !== reg_passwordCheck) {
        res.send("Passwords do not match. Please try again. <a href='/'>Back to register</a>");
        return;
    }
    //check for duplicate username
    const selectUsernameQuery = 'SELECT username FROM user WHERE username = ?';
    db.query(selectUsernameQuery, [reg_username], (err, results) => {
        if (err) {
            res.status(500).send('Error checking username: ' + err);
            return;
        }
        if (results.length > 0) {
            res.send(`This username is taken, please try a new one. <a href='/'>Back to register</a>`);
        } else {
            //check for duplicate email
            const selectEmailQuery = 'SELECT email FROM user WHERE email = ?';
            db.query(selectEmailQuery, [reg_email], (err, results) => {
                if (err) {
                    res.status(500).send('Error checking email: ' + err);
                    return;
                }
                if (results.length > 0) {
                    res.send(`This email is taken, please try a new one. <a href='/'>Back to register</a>`);
                } else {
                    //if all is good then insert new user
                    const insertQuery = 'INSERT INTO user (username, password, email, firstName, lastName) VALUES (?, ?, ?, ?, ?)';
                    db.query(insertQuery, [reg_username, reg_password, reg_email, reg_firstName, reg_lastName], (err, results) => {
                        if (err) {
                            res.status(500).send('Error inserting user: ' + err);
                            return;
                        }
                        res.send("New account added successfully! Login on main page. <a href='/'>Back to login</a>");
                    });
                }
            });
        }
    });
});

app.post('/login', (req, res) => {
    const { login_username, login_password } = req.body;
    //make sure the fields are filled out
    if (!login_username || !login_password) {
        res.send("Please provide both username and password. <a href='/'>Back to login</a>");
        return;
    }
    //get password for the username
    const selectQuery = 'SELECT password FROM user WHERE username = ?';
    db.query(selectQuery, [login_username], (err, results) => {
        if (err) {
            res.status(500).send('Error checking username: ' + err);
            return;
        }
        if (results.length === 0 || results[0].password !== login_password) {
            res.send("Incorrect username or password. <a href='/'>Back to login</a>");
        } else {
            //password is correct open the review page
            req.session.username = login_username;
            res.redirect('/review');
        }
    });
});

//review page
app.get('/review', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/');
    }
    res.sendFile(path.join('C:/Users/caili/COMP440_TeamNo_4', 'review.html'));
});


app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('Error logging out: ' + err);
        }
        res.redirect('/');
    });
});


app.post('/submit-item', (req, res) => {
    const { title, description, category, price } = req.body;
    
    // Print the received data (for debugging purposes)
    console.log('Received data:', { title, description, category, price });

    // Here, you would insert the data into your database
    // For now, let's just send a success response
    //res.status(200).send('Item inserted successfully');

    const insertQuery = 'INSERT INTO items (title, description, category, price) VALUES (?, ?, ?, ?)';
    db.query(insertQuery, [title, description, category, price], (err, results) => {
        if (err) {
            res.status(500).send('Error inserting an item' + err);
            return;
        } else {
            res.send("item added to the database successfully");
        }
    
    });
});
//search items
app.post('/searchItems', (req, res) => {
    const { category } = req.body;

    if (!category) {
        return res.status(400).send('Category is required');
    }

    const searchQuery = 'SELECT * FROM items WHERE category = ?';
    db.query(searchQuery, [category], (err, results) => {
        if (err) {
            return res.status(500).send('Error searching items: ' + err);
        }
        if (results.length === 0) {
            return res.send('No items found in this category.');
        }

        let html = '<h2>Items Found:</h2><table border="1"><tr><th>Title</th><th>Description</th><th>Category</th><th>Price</th><th>Review</th></tr>';
        results.forEach(item => {
            html += `<tr>
                        <td>${item.title}</td>
                        <td>${item.description}</td>
                        <td>${item.category}</td>
                        <td>${item.price}</td>
                     </tr>`;
        });
        html += '</table>';

        res.send(html);
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
