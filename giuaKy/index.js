const express = require('express');
const app = express();
const port = 3000;
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
// cau hinh aws
process.env.AWS_SDK_JS_SUPPRES_MAINTENANCE_MODE_MESSAGE = "1";
// cau hinh aws sdk de truy cap vao cloud aws thong qua tai khoan IAM user 
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
// cau hinh s3
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

//register middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));
app.set('view engine', 'ejs');

// cau hinh multer quan ly upload image
const storage = multer.memoryStorage({
    destination(req, file, cb) {
        cb(null, "");
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2000000 }, // file chu toi da 2MB
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
        cb("Error : hay chon file anh cho dung");
    }
}

app.get('/', async (req, res) => {
    try {
        const params = { TableName: tableName };
        const data = await dynamodb.scan(params).promise(); // lay du lieu tu bang tren aws
        // sap xep du lieu
        data.Items.sort((a, b) => a.maTraiCay - b.maTraiCay);
        console.log('data', data.Items);
        return res.render('index.ejs', { data: data.Items });
    } catch (error) {
        console.log('error: loi load du lieu', error);
        return res.status(500).send('loi server');
    }
});

app.post('/save', upload.single("image"), async (req, res) => {
    try {
        const maTraiCay = req.body.maTraiCay.trim();
        const tenTraiCay = req.body.tenTraiCay.trim();
        const donViTinh = req.body.donViTinh.trim();
        const gia = req.body.gia.trim();

        // Kiểm tra các trường dữ liệu
        if (!maTraiCay || !tenTraiCay || !gia || !donViTinh) {
            return res.status(400).send("Vui lòng nhập đầy đủ thông tin.");
        }

        if (!/^[0-9]+$/.test(maTraiCay)) {
            return res.status(400).send("Mã trái cây chỉ được nhập số.");
        }

        if (!/^[a-zA-Z0-9\s]+$/.test(tenTraiCay)) {
            return res.status(400).send("Tên trái cây chỉ được nhập số và chữ.");
        }

        if (!/^[0-9]+$/.test(gia)) {
            return res.status(400).send("Giá được nhập số.");
        }

        // Kiểm tra xem mã sản phẩm có trùng lặp không
        const existingItem = await dynamodb.get({
            TableName: tableName,
            Key: {
                maTraiCay: Number(maTraiCay)
            }
        }).promise();

        if (existingItem.Item) {
            return res.status(400).send("Mã trái đã tồn tại.");
        }

        const image = req.file?.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${maTraiCay}_${Date.now().toString()}.${fileType}`;

        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };
        s3.upload(paramsS3, async (err, data) => {
            if (err) {
                console.log('error', err);
                return res.send('Loi upload failed: ');
            } else {
                const imageURL = data.Location; // lay duong dan file tu s3
                const paramsDynamoDb = {

                    TableName: tableName,
                    Item: {
                        maTraiCay: Number(maTraiCay),
                        tenTraiCay: tenTraiCay,
                        donViTinh: Number(donViTinh),
                        gia: Number(gia),
                        image: imageURL
                    }
                }
                await dynamodb.put(paramsDynamoDb).promise();
                return res.redirect("/"); // ve trang chu
            }
        })
    } catch (error) {
        console.log('error', error);
        return res.send('Loi them');
    }
})

app.post('/delete', upload.fields([]), (req, res) => {
    const listCheckboxSelected = Object.keys(req.body); // Lấy ra tất cả checkboxs
    if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
        return res.redirect('/');
    }
    try {
        function onDeleteItem(length) { // Định nghĩa hàm đệ quy xóa
            const params = {
                TableName: tableName,
                Key: {
                    maTraiCay: Number(listCheckboxSelected[length])
                }
            };

            dynamodb.delete(params, (err, data) => {
                if (err) {
                    console.log("error=", err);
                    return res.send("Interal Server Error!");
                } else if (length > 0) onDeleteItem(length - 1); // Nếu vị trí cần xóa vẫn > 0 thì gọi đệ quy xóa tiếp 
                else return res.redirect("/"); // Render lại trang index.ejs để cập nhật dữ liệu table
            });
        }
        onDeleteItem(listCheckboxSelected.length - 1); // Gọi hàm đệ quy xóa
    } catch (error) {
        console.log("Error deleting data from DynamoDB:", error);
        return res.status(500).send("Internal Server Error");
    }
})

app.listen(port, () => {
    console.log(`Server is running port: ${port}`);
})