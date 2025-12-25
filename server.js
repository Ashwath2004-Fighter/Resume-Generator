require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

// CORS Configuration for Production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
  'https://your-app.vercel.app' // Replace with actual Vercel URL after deployment
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); // Allow all for now, restrict later
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.static("public"));

// Create payments directory if it doesn't exist
const paymentsDir = path.join(__dirname, "payments");
if (!fs.existsSync(paymentsDir)) {
  fs.mkdirSync(paymentsDir, { recursive: true });
}

// Serve payment screenshots
app.use("/payments", express.static(paymentsDir));

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, paymentsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}_${req.body.phone}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const client = new MongoClient(process.env.MONGO_URI);
let usersCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    const db = client.db("registrationDB");
    usersCollection = db.collection("users");
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
}
connectDB();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "Server is running",
    message: "Calisthenics Festival API",
    endpoints: {
      register: "POST /register",
      users: "GET /users",
      stats: "GET /stats"
    }
  });
});

// Register API with file upload
app.post("/register", upload.single("paymentScreenshot"), async (req, res) => {
  try {
    console.log("📝 Registration request received");
    console.log("Body:", req.body);
    console.log("File:", req.file);

    const { name, email, phone, age, gender, experience, participation } = req.body;

    if (!name || !email || !phone || !age || !gender || !experience || !participation) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!req.file) {
      console.log("❌ No payment screenshot uploaded");
      return res.status(400).json({ message: "Payment screenshot is required" });
    }

    const existing = await usersCollection.findOne({ email });
    if (existing) {
      console.log("⚠️ User already exists:", email);
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "User already registered with this email" });
    }

    const result = await usersCollection.insertOne({
      name,
      email,
      phone,
      age: parseInt(age),
      gender,
      experience,
      participation,
      paymentScreenshot: req.file.filename,
      paymentScreenshotPath: req.file.path,
      registeredAt: new Date()
    });

    console.log("✅ User registered successfully:", email);
    res.json({ message: "Registration successful! Payment verification in progress. See you at the festival!" });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ message: "Registration failed: " + error.message });
  }
});

// Get all users (Admin)
app.get("/users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Get statistics
app.get("/stats", async (req, res) => {
  try {
    const total = await usersCollection.countDocuments();
    const male = await usersCollection.countDocuments({ gender: "male" });
    const female = await usersCollection.countDocuments({ gender: "female" });
    const beginners = await usersCollection.countDocuments({ experience: "beginner" });
    const competition = await usersCollection.countDocuments({ 
      participation: { $in: ["competition", "both"] } 
    });
    const workshop = await usersCollection.countDocuments({ 
      participation: { $in: ["workshop", "both"] } 
    });

    res.json({ total, male, female, beginners, competition, workshop });
  } catch (error) {
    console.error("❌ Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch statistics" });
  }
});

// Delete user (Admin)
app.delete("/users/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    
    const user = await usersCollection.findOne({ _id: new ObjectId(req.params.id) });
    
    if (user && user.paymentScreenshotPath) {
      if (fs.existsSync(user.paymentScreenshotPath)) {
        fs.unlinkSync(user.paymentScreenshotPath);
      }
    }
    
    await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File size is too large. Maximum size is 5MB." });
    }
    return res.status(400).json({ message: error.message });
  }
  
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);