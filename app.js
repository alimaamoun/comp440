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
app.get('/sortedInformation', (req, res) => {
    res.sendFile(path.join(__dirname, 'sortedInformation.html'));
});

//most expensive #1
app.post('/getMostExpensiveItems', (req, res) => {
    const query = `
        SELECT i.category, i.title, i.price
        FROM items i
        JOIN (
            SELECT category, MAX(price) AS max_price
            FROM items
            GROUP BY category
        ) max_items
        ON i.category = max_items.category AND i.price = max_items.max_price;
    `;
    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching most expensive items:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'No items found' });
        }
        res.json(results);
    });
});


//most items on 7/4/2024 #4
app.post('/most-items-on-7-4-2024', (req, res) => {
    const query = `
        WITH UserPostCounts AS (
            SELECT username, COUNT(item_id) AS post_count
            FROM items
            WHERE date = '2024-07-04'
            GROUP BY username
        ),
        MaxPostCount AS (
            SELECT MAX(post_count) AS max_count
            FROM UserPostCounts
        )
        SELECT u.username, u.post_count
        FROM UserPostCounts u
        JOIN MaxPostCount m ON u.post_count = m.max_count;

    `;

    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching most items on 7/4/2024:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'No users found who posted 2 or more items on 7/4/2024' });
        }

        res.json(results);
    });
});


//poor reviewers #5
app.get('/poor-reviewers', (req, res) => {
    const username = req.session.username;

    if (!username) {
        return res.status(403).json({ error: 'Please relog.' }); 
    }

    const query = `
        SELECT DISTINCT r.user_name
        FROM reviews r
        WHERE NOT EXISTS (
            SELECT 1
            FROM reviews r2
            WHERE r2.user_name = r.user_name
            AND r2.rating <> 'Poor'
        )
        AND EXISTS (
            SELECT 1
            FROM reviews r3
            WHERE r3.user_name = r.user_name
        );
    `;

    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching poor reviewers:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (!results || results.length === 0) {
            return res.status(404).json({ message: 'No poor reviewers found.' });
        }

        res.status(200).json(results);
    });
});

//never poor reviewers #2 on new requirements
app.get('/never-poor-reviewers', (req, res) => {
    const username = req.session.username;

    if (!username) {
        return res.status(403).send('Please relog.');
    }
    const query = `
        SELECT DISTINCT u.username
        FROM user u
        LEFT JOIN reviews r ON u.username = r.user_name
        WHERE r.user_name IS NULL
        OR NOT EXISTS (
            SELECT 1
            FROM reviews r2
            WHERE r2.user_name = u.username
            AND r2.rating = 'Poor'
        );
    `;

    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching never-poor reviewers:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        console.log('Query results:', results);

        if (results.length === 0) {
            return res.status(404).json({ message: 'No users found who have never posted a poor review.' });
        }

        res.json(results);
    });
});

//users with bad items #3 on new requirements*****************************Adrian
app.get('/users-with-bad-items', (req, res) => {
    const username = req.session.username;

    if (!username) {
        return res.status(403).json({ error: 'Please relog.' });
    }

    const query = `
        SELECT u.username
        FROM user u
        WHERE u.username NOT IN (
        SELECT i.username
        FROM items i
        JOIN reviews r ON i.item_id = r.item_id
        WHERE r.rating = 'excellent'
        GROUP BY i.item_id, i.username
        HAVING COUNT(r.rating) >= 3
);

    `;

    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching users with bad items:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'No users found with bad items.' });
        }

        res.json(results);
    });
});

//users with good items #6
app.get('/users-with-good-items', (req, res) => {

    const username = req.session.username;

    if (!username) {
        return res.status(403).send('Please relog.');
    }

    const query = `
        SELECT DISTINCT u.username
        FROM user u
        LEFT JOIN items i ON u.username = i.username
        LEFT JOIN reviews r ON i.item_id = r.item_id
        GROUP BY u.username
        HAVING SUM(CASE WHEN r.rating = 'poor' THEN 1 ELSE 0 END) = 0
        -- Users who have not posted any items
        UNION
        SELECT username
        FROM user
        WHERE username NOT IN (SELECT DISTINCT username FROM items);
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching users: ' + err);
            res.send('Error fetching users.');
            return;
        }
        console.log('Query 6 results:', results);
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'No user found' });
        }
        res.json(results);
    });
});

//two categories on same day #2
app.post('/users-with-items-in-two-categories', (req, res) => {
    const { category1, category2 } = req.body;
    console.log("here", category1, category2);

    const query = `
    SELECT u.username
    FROM user u
    JOIN items i1 ON u.username = i1.username
    JOIN items i2 ON u.username = i2.username
    WHERE i1.date = i2.date
    AND i1.category = ?
    AND i2.category = ?
    AND i1.item_id <> i2.item_id
    GROUP BY u.username
    HAVING COUNT(DISTINCT i1.item_id) >= 1
    AND COUNT(DISTINCT i2.item_id) >= 1;
    `;

    db.query(query, [category1, category2], (err, results) => {
        if (err) {
            console.error('Error fetching users: ' + err);
            res.status(500).json({ message: 'Error fetching users.' });
            return;
        }

        console.log('Query results:', results);
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'No Users Found' });
        }

        res.json(results);
    });
});

//#3 good comments
app.post('/items-with-excellent-or-good-comments', (req, res) => {
    const { user } = req.body;
    console.log(user);

    const query = `
    SELECT i.item_id, i.title, i.description, i.category, i.price, i.date
    FROM items i
    JOIN reviews r ON i.item_id = r.item_id
    WHERE i.username = ?
    GROUP BY i.item_id, i.title, i.description, i.category, i.price, i.date
    HAVING COUNT(r.review_id) > 0 -- Ensures the item has at least one review
    AND COUNT(CASE WHEN r.rating IN ('Fair', 'Poor') THEN 1 END) = 0;
    `;

    db.query(query, [user], (err, results) => {
        if (err) {
            console.error('Error fetching items: ' + err);
            res.status(500).json({ message: 'Error fetching items.' });
            return;
        }

        console.log('Query results:', results);
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'No Items from this User' });
        }

        res.json(results);
    });
});


//favorites #1 on new requirements
app.post('/users-favorited-by-two-users', (req, res) => {
    const { userX, userY } = req.body;
    console.log('Received users:', userX, userY);

    //if the same username is selected send error
    if (userX === userY) {
        console.log('Cannot select the same user');
        return res.status(400).json({ message: 'Cannot select the same user' });
    }

    const query = `
        SELECT f1.user AS common_favorite
        FROM favorites f1
        JOIN favorites f2 ON f1.user = f2.user
        WHERE f1.favoritedBy = ? AND f2.favoritedBy = ?;
    `;

    db.query(query, [userX, userY], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        if (results.length === 0) {
            console.log('No favorites found');
            return res.status(404).json({ message: 'No Favorites Found' });
        }

        console.log('Common favorites found:', results);
        res.json(results);
    });
});

//get all usernames
app.get('/getUsernames', (req, res) => {
    const query = 'SELECT username FROM user';

    db.query(query, (error, results) => {
        if (error) {
            console.error('Error fetching usernames:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
        res.json(results);
    });
});

//people favorited by two users #1 NEW
app.post('/users-favorited-by-two-users', (req, res) => {
    const { userX, userY } = req.body;
    console.log(userX, userY);

    //if the same username is selected send error
    if (userX === userY) {
        return res.status(400).json({ message: 'Cannot select the same user' });
    }

    const query = `
        SELECT f1.user AS common_favorite
        FROM favorites f1
        JOIN favorites f2 ON f1.user = f2.user
        WHERE f1.favoritedBy = ? AND f2.favoritedBy = ?;
    `;

    db.query(query, [userX, userY], (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        //no favorites found
        if (results.length === 0) {
            return res.status(404).json({ message: 'No Favorites Found' });
        }
        res.json(results);
    });
});


//start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
