const express = require('express');
const port = 3000;
const app = express();
let courses = require('./data');

//register middleware
app.use(express.urlencoded({ extended : true}));
app.use(express.static('./views'));

//config view 
app.set('view engine', 'ejs');
app.set('views','./views');

app.get('/', (req, res) => {
    return res.render('index', {courses});
});

app.post('/save', (req, res) => {
    const id = Number(req.body.id);
    const name = req.body.name;
    const course_type = req.body.course_type;
    const semester = req.body.semester;
    const department = req.body.department;

    const params = {
        "id": id,
        "name": name,
        "course_type": course_type,
        "semester": semester,
        "department": department
    }

    courses.push(params);

    return res.redirect('/');
})

app.post('/delete', (req, res) => {
    const listCheckboxSelected = Object.keys(req.body);

    if (listCheckboxSelected.length <= 0) {
        return res.redirect('/');
    }

    for (let i = 0; i < listCheckboxSelected.length; i++) {
        const idToDelete = Number(listCheckboxSelected[i]);
        courses = courses.filter(course => course.id !== idToDelete);
    }

    return res.redirect('/');
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})