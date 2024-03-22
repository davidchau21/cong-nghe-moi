const express = require('express');
const app = express();
const port = 3000;
// const data = require('./data');
const multer = require('multer'); // khai báo thư viện multer
const AWS = require('aws-sdk'); // khai báo thư viện aws-sdk
require("dotenv").config();
const path = require('path');

//Cấu hình aws
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1"; // kể từ năm 2023 v2 đã deprected ta chọn sử dụng aws-sdk javascript v2 thay vì v3

// Cấu hình aws sdk để truy cập vào Cloud Aws thông qua tài khoản IAM user
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

//register middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));

//Cấu hình multer quản lý upload image
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "")
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 2000000 }, // chỉ cho phép file tối đa là 2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb("Error: Pls upload image /jpeg|jpg|png|gif/ only!");
    }
}

//config view 
app.set('view engine', 'ejs');
app.set('views', './views');

//routing
app.get('/', async (req, res) => {
    try {
        const params = { TableName: tableName };
        const data = await dynamodb.scan(params).promise(); // Dùng hàm scan để lấy toàn bộ dữ liệu trong table Dynamodb
        // sắp xếp dữ liệu
        data.Items.sort((a, b) => a.maSanPham - b.maSanPham);
        console.log("data=", data.Items);
        return res.render('index.ejs', { data: data.Items }); // Dùng biến response để render ra trang index.ejs đồng thời truyền biến 'data'
    } catch (erro) {
        console.log("Error retrieving data from Dynamodb", erro);
        return res.status(500).send("Internal Server Error");
    }
});

// app.post("/save", upload.single("image"), (req, res) => {
//     //Middleware uploadsingle(image) chỉnh định rằng field có name 'image' trong request sẽ được xử lý (lọc, phần)
//     try {
//         const maSanPham = Number(req.body.maSanPham); // Lấy ra các tham số từ body của form
//         const tenSanPham = req.body.tenSanPham; // Lấy ra các tham số từ body của form 
//         const soLuong = req.body.soLuong; // Lấy ra các tham số từ form

//         const image = req.file?.originalname.split(".");
//         const fileType = image[image.length - 1];
//         const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;

//         const paramsS3 = {
//             Bucket: bucketName,
//             Key: filePath,
//             Body: req.file.buffer,
//             ContentType: req.file.mimetype,
//         };

//         s3.upload(paramsS3, async (err, data) => { // Upload ảnh lên S3 trước
//             if (err) {
//                 console.log("error=", err);
//                 return res.send("Internal server error!");
//             } else { // Khi upload S3 thành công 
//                 const imageURL = data.Location; // Gán URL trả về vào field trong table DynamoDB
//                 const paramsDynamoDB = {
//                     TableName: tableName,
//                     Item: {
//                         maSanPham: Number(maSanPham),
//                         tenSanPham: tenSanPham,
//                         soLuong: soLuong,
//                         image: imageURL
//                     }
//                 };

//                 await dynamodb.put(paramsDynamoDB).promise();
//                 return res.redirect("/"); // Render lại trang index đề cập nhật dữ liệu table 
//             }
//         });
//     } catch (error) {
//         console.log("Error saving data to Dynamodb", error);
//         return res.status(500).send("Internal Server Error");
//     }
// });

app.post('/save', upload.single("image"), async (req, res) => {
    try {
        const maSanPham = req.body.maSanPham.trim();
        const tenSanPham = req.body.tenSanPham.trim();
        const soLuong = req.body.soLuong.trim();
    
        // Kiểm tra các trường dữ liệu
        if (!maSanPham || !tenSanPham || !soLuong) {
            return res.status(400).send("Vui lòng nhập đầy đủ thông tin.");
        }

        if (!/^[0-9]+$/.test(maSanPham)) {
            return res.status(400).send("Mã sản phẩm chỉ được nhập số.");
        }

        if (!/^[a-zA-Z0-9\s]+$/.test(tenSanPham)) {
            return res.status(400).send("Tên sản phẩm chỉ được nhập số và chữ.");
        }

        if (!/^[0-9]+$/.test(soLuong)) {
            return res.status(400).send("Số lượng chỉ được nhập số.");
        }

        // Kiểm tra xem mã sản phẩm có trùng lặp không
        const existingItem = await dynamodb.get({
            TableName: tableName,
            Key: {
                maSanPham: Number(maSanPham)
            }
        }).promise();

        if (existingItem.Item) {
            return res.status(400).send("Mã sản phẩm đã tồn tại.");
        }
    
        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;
    
        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };
    
        s3.upload(paramsS3, async (err, data) => { // upload file lên S3
            if (err) {
                console.log('error=', err);
                return res.send("Internal Server Error");
            } else { // upload file lên S3 thành công
                const imageURL = data.Location; // lấy đường dẫn file từ S3
                const paramsDynamoDB = {
                    TableName: tableName,
                    Item: {
                        maSanPham: Number(maSanPham),
                        tenSanPham: tenSanPham,
                        soLuong: Number(soLuong),
                        image: imageURL,
                    }
                };
    
                await dynamodb.put(paramsDynamoDB).promise();
                return res.redirect('/'); // chuyển hướng về trang chủ
            }
        });
    } catch (error) {
        console.log("Error saving data to DynamoDB", error);
        return res.status(500).send("Internal Server Error");
    }
});



app.post('/delete', upload.fields([]), (req, res) => {
    const listCheckboxSelected = Object.keys(req.body); // Lấy ra tất cả checkboxs
    if(!listCheckboxSelected || listCheckboxSelected.length <= 0){
        return res.redirect('/');
    }
    try {
        function onDeleteItem(length) { // Định nghĩa hàm đệ quy xóa
            const params = {
                TableName: tableName,
                Key: {
                    maSanPham: Number(listCheckboxSelected[length])
                }
            };

            dynamodb.delete(params, (err, data) => {
                if(err){
                    console.log("error=", err);
                    return res.send("Interal Server Error!");
                }else if (length > 0) onDeleteItem(length -1); // Nếu vị trí cần xóa vẫn > 0 thì gọi đệ quy xóa tiếp 
                else return res.redirect("/"); // Render lại trang index.ejs để cập nhật dữ liệu table
            });
        }
        onDeleteItem(listCheckboxSelected.length - 1); // Gọi hàm đệ quy xóa
    }catch (error) {
        console.log("Error deleting data from DynamoDB:", error);
        return res.status(500).send("Internal Server Error");
    }
})



app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
