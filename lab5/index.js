const express = require('express');
const app = express();
const port = 3000;
const data = require('./data');

//register middleware
app.use(express.urlencoded({ extended: true}));
app.use(express.static('./views'));

//config view 
app.set('view engine', 'ejs');
app.set('views', './views');

//routing
app.get('/', (req, res) => {
    res.render('index', {data: data});
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
