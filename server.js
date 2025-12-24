require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const client = new MongoClient(process.env.MONGO_URI);
let usersCollection;

// Connect to MongoDB
async function connectDB() {
  await client.connect();
  const db = client.db("registrationDB");
  usersCollection = db.collection("users");
  console.log("✅ MongoDB Connected");
}
connectDB();

// Register API
app.post("/register", async (req, res) => {
  const { name, email, phone, age, gender, experience, participation } = req.body;

  // Validate required fields
  if (!name || !email || !phone || !age || !gender || !experience || !participation) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Check if user already exists
  const existing = await usersCollection.findOne({ email });
  if (existing) {
    return res.json({ message: "User already registered with this email" });
  }

  // Insert new user
  await usersCollection.insertOne({
    name,
    email,
    phone,
    age: parseInt(age),
    gender,
    experience,
    participation,
    registeredAt: new Date()
  });

  res.json({ message: "Registration successful! See you at the festival!" });
});

// Get all users (Admin)
app.get("/users", async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.json(users);
});

// Get statistics
app.get("/stats", async (req, res) => {
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
});

// Delete user (Admin)
app.delete("/users/:id", async (req, res) => {
  const { ObjectId } = require("mongodb");
  await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: "User deleted successfully" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);