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
    //check if passwords match
    const { reg_username, reg_password, reg_passwordCheck, reg_email, reg_firstName, reg_lastName } = req.body;
    if (reg_password !== reg_passwordCheck) {
        res.send("Passwords do not match. Please try again. <a href='/'>Back to register</a>");
        return;
    }
    //check for duplicate username
    const selectUsernameQuery = 'SELECT username FROM user WHERE username = ?';
    db.query(selectUsernameQuery, [reg_username], (err, results) => {
        if (err) {
            res.send('Error checking username: ' + err);
            return;
        }
        if (results.length > 0) {
            res.send(`This username is taken, please try a new one. <a href='/'>Back to register</a>`);
        } else {
             //check for duplicate email
            const selectEmailQuery = 'SELECT email FROM user WHERE email = ?';
            db.query(selectEmailQuery, [reg_email], (err, results) => {
                if (err) {
                    res.send('Error checking email: ' + err);
                    return;
                }
                if (results.length > 0) {
                    res.send(`This email is taken, please try a new one. <a href='/'>Back to register</a>`);
                } else {
                    //if all is good then insert new user
                    const insertQuery = 'INSERT INTO user (username, password, email, firstName, lastName) VALUES (?, ?, ?, ?, ?)';
                    db.query(insertQuery, [reg_username, reg_password, reg_email, reg_firstName, reg_lastName], (err, results) => {
                        if (err) {
                            res.send('Error inserting user: ' + err);
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
            res.send('error checking username: ' + err);
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
    res.sendFile(path.join(__dirname, 'review.html'));
});
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.send('error logging out: ' + err);
        }
        res.redirect('/');
    });
});
app.post('/submit-item', (req, res) => {
    const { title, description, category, price } = req.body;
    const username = req.session.username;
    if (!username) {
        return res.send('Please relog.');
    }
    const countQuery = `
        SELECT COUNT(*) as itemCount 
        FROM items 
        WHERE username = ? AND date = CURDATE()`;
    db.query(countQuery, [username], (err, results) => {
        if (err) {
            return res.send('error checking item count: ' + err);
        }

        if (results[0].itemCount >= 2) {
            return res.send('You have already posted 2 items today. Please wait 24 hours to post again.');
        }
        const insertQuery = 'INSERT INTO items (username, title, description, category, price, date) VALUES (?, ?, ?, ?, ?, CURDATE())';
        db.query(insertQuery, [username, title, description, category, price], (err, results) => {
            if (err) {
                return res.send('error inserting item: ' + err);
            }
            res.send('Item added to the database successfully!');
        });
    });
});
app.post('/searchItems', (req, res) => {
    const { category } = req.body;

    if (!category) {
        return res.send('Please pick a category');
    }
    const searchQuery = 'SELECT * FROM items WHERE category = ?';
    db.query(searchQuery, [category], (err, results) => {
        if (err) {
            return res.send('error searching items: ' + err);
        }
        if (results.length === 0) {
            return res.send('No items found in this category.');
        }
        let html = `
            <h2>Items Found:</h2>
            <form action="/submit-review" method="POST">
                <table border="1">
                    <tr>
                        <th>Select</th>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Price</th>
                    </tr>`;
        results.forEach(item => {
            html += `
                <tr>
                    <td><input type="radio" name="item_id" value="${item.item_id}" required></td>
                    <td>${item.title}</td>
                    <td>${item.description}</td>
                    <td>${item.category}</td>
                    <td>${item.price}</td>
                </tr>`;
        });
        html += `
                </table>
                <button type="submit">Review</button>
            </form>`;

        res.send(html);
    });
});
app.post('/submit-review', (req, res) => {
    const { item_id } = req.body;
    const username = req.session.username;
    if (!username) {
        return res.send('Please relog.');
    }
    if (!item_id) {
        return res.send('Please select an item to review.');
    }
    const html = `
        <h2>Submit Review</h2>
        <form action="/submit-review-checks" method="POST">
            <input type="hidden" name="item_id" value="${item_id}">
            <label for="rating">Rating:</label>
            <select name="rating" id="rating" required>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
            </select>
            <br>
            <label for="description">Description:</label>
            <textarea name="description" id="description" required></textarea>
            <br>
            <button type="submit">Submit Review</button>
        </form>`;

    res.send(html);
});
app.post('/submit-review-checks', (req, res) => {
    const { item_id, rating, description } = req.body;
    const user_name = req.session.username;

    if (!user_name) {
        return res.send('Please relog.');
    }

    if (!item_id || !rating || !description) {
        return res.send('Please fill out all the fields.');
    }
    //make sure user can not review their own item
    const selectItemQuery = 'SELECT username FROM items WHERE item_id = ?';
    db.query(selectItemQuery, [item_id], (err, results) => {
        if (err) {
            return res.send('error checking item owner: ' + err);
        }
        if (results.length === 0) {
            return res.send('error finding item id');
        }
        if (results[0].username === user_name) {
            return res.send('You cannot review your own item. <a href="/review">Back to review page</a>');
        }
        //check if the user has already reviewed the item
        const reviewCheckQuery = 'SELECT COUNT(*) as reviewCount FROM reviews WHERE user_name = ? AND item_id = ?';
        db.query(reviewCheckQuery, [user_name, item_id], (err, results) => {
            if (err) {
                return res.send('error inserting review: ' + err);
            }
            if (results[0].reviewCount > 0) {
                return res.send('You have already reviewed this item. <a href="/review">Back to review page</a>');
            }
            //check if they reached the limit of reviews per day
            const countQuery = `
                SELECT COUNT(*) as reviewCount 
                FROM reviews 
                WHERE user_name = ? AND date = CURDATE()`;

            db.query(countQuery, [user_name], (err, results) => {
                if (err) {
                    return res.send('error checking review count: ' + err);
                }
                if (results[0].reviewCount >= 3) {
                    return res.send('You have already posted 3 reviews today. Please wait 24 hours to post again. <a href="/review">Back to review page</a>');
                }
                //insert review
                const insertQuery = 'INSERT INTO reviews (item_id, user_name, rating, description, date) VALUES (?, ?, ?, ?, CURDATE())';
                db.query(insertQuery, [item_id, user_name, rating, description], (err, results) => {
                    if (err) {
                        return res.send('error inserting review: ' + err);
                    }
                    res.send('Review added to the database successfully! <a href="/review">Back to review page</a>');
                });
            });
        });
    });
});

//start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
