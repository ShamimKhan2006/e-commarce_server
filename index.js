const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const multer = require("multer");
const app = express();
const port = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "https://e-commarce-client-five.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
async function connectDB() {
  await client.connect();
  db = client.db("e-commerce");
  console.log("✅ MongoDB Connected to e-commerce DB");
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
const requireAuth = (req, res, next) => {
  const userId = req.header("x-user-id");
  const email = req.header("x-user-email");
  if (!userId || !email) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }
  req.user = { id: userId, email, role: req.header("x-user-role") || "user" };
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden. Admin access required." });
  }
  next();
};

// ============================================
// HEALTH CHECK
// ============================================
app.get("/", (req, res) => res.send("E-Commerce Backend Running"));

// ============================================
// PRODUCTS
// ============================================
app.get("/products", async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 20 } = req.query;
    const query = {};

    if (category && category !== "All") {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    let sortOption = { createdAt: -1 };
    if (sort === "price-asc") sortOption = { price: 1 };
    else if (sort === "price-desc") sortOption = { price: -1 };
    else if (sort === "rating") sortOption = { rating: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      db.collection("products").find(query).sort(sortOption).skip(skip).limit(parseInt(limit)).toArray(),
      db.collection("products").countDocuments(query),
    ]);

    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("GET /products error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

app.post("/products", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = { ...req.body, createdAt: new Date() };
    const result = await db.collection("products").insertOne(product);
    res.status(201).json({ ...product, _id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.put("/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: new Date() };
    const result = await db.collection("products").updateOne({ _id: new ObjectId(id) }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product updated", id });
  } catch (error) {
    res.status(500).json({ error: "Failed to update product" });
  }
});

app.delete("/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// ============================================
// CATEGORIES
// ============================================
app.get("/categories", async (req, res) => {
  try {
    const categories = await db.collection("products").distinct("category");
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ============================================
// ORDERS
// ============================================
app.post("/orders", requireAuth, async (req, res) => {
  try {
    const order = {
      ...req.body,
      userId: req.user.id,
      email: req.user.email,
      status: "Processing",
      createdAt: new Date(),
    };
    const result = await db.collection("orders").insertOne(order);
    res.status(201).json({ ...order, _id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { userId: req.user.id };
    const orders = await db.collection("orders").find(query).sort({ createdAt: -1 }).toArray();
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.get("/orders/:id", requireAuth, async (req, res) => {
  try {
    const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

app.put("/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await db.collection("orders").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Order not found" });
    res.json({ message: "Order status updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order status" });
  }
});

// ============================================
// WISHLIST
// ============================================
app.get("/wishlist", requireAuth, async (req, res) => {
  try {
    const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
    res.json({ items: doc?.items || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
});

app.post("/wishlist", requireAuth, async (req, res) => {
  try {
    const { product } = req.body;
    const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
    const items = doc?.items || [];
    const exists = items.some((i) => i.id === product.id);
    const updated = exists ? items.filter((i) => i.id !== product.id) : [...items, product];

    await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: updated, updatedAt: new Date() } }, { upsert: true });
    res.json({ items: updated, removed: exists });
  } catch (error) {
    res.status(500).json({ error: "Failed to update wishlist" });
  }
});

app.delete("/wishlist", requireAuth, async (req, res) => {
  try {
    await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } }, { upsert: true });
    res.json({ items: [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear wishlist" });
  }
});

// ============================================
// CUSTOMERS / USERS
// ============================================
app.get("/admin/customers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.collection("user").find({}, { projection: { name: 1, email: 1, image: 1, role: 1, emailVerified: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray();
    const safe = users.map((u) => ({ id: u._id.toString(), name: u.name, email: u.email, image: u.image, role: u.role || "user", emailVerified: !!u.emailVerified, createdAt: u.createdAt }));
    res.json({ users: safe });
  } catch (error) {
    res.status(500).json({ error: "Failed to load customers" });
  }
});

// ============================================
// BLOGS
// ============================================
app.get("/blogs", async (req, res) => {
  try {
    const { slug, id } = req.query;
    if (slug) {
      const post = await db.collection("blog").findOne({ slug: slug });
      if (!post) return res.status(404).json({ error: "Blog not found" });
      return res.json(post);
    }
    if (id) {
      const post = await db.collection("blog").findOne({ _id: new ObjectId(id) });
      if (!post) return res.status(404).json({ error: "Blog not found" });
      return res.json(post);
    }
    const posts = await db.collection("blog").find({}).sort({ createdAt: -1 }).toArray();
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});

app.post("/blogs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { title, excerpt, content, coverImage, tags, published, slug } = req.body;
    const blog = {
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      excerpt: excerpt || content.slice(0, 140),
      content,
      coverImage: coverImage || "",
      author: req.user.email,
      tags: Array.isArray(tags) ? tags : [],
      published: !!published,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("blog").insertOne(blog);
    res.status(201).json({ ...blog, id: result.insertedId.toString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to create blog" });
  }
});

app.put("/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: new Date() };
    const result = await db.collection("blog").updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Blog not found" });
    res.json({ message: "Blog updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update blog" });
  }
});

app.delete("/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("blog").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Blog not found" });
    res.json({ message: "Blog deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete blog" });
  }
});

// ============================================
// TESTIMONIALS
// ============================================
app.get("/testimonials", async (req, res) => {
  try {
    const testimonials = await db.collection("testimonials").find({}).sort({ createdAt: -1 }).toArray();
    res.json(testimonials);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

app.post("/testimonials", requireAuth, requireAdmin, async (req, res) => {
  try {
    const testimonial = { ...req.body, createdAt: new Date() };
    const result = await db.collection("testimonials").insertOne(testimonial);
    res.status(201).json({ ...testimonial, _id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: "Failed to create testimonial" });
  }
});

app.delete("/testimonials/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("testimonials").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Testimonial not found" });
    res.json({ message: "Testimonial deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete testimonial" });
  }
});

// ============================================
// FAQs
// ============================================
app.get("/faqs", async (req, res) => {
  try {
    const faqs = await db.collection("faqs").find({}).sort({ order: 1 }).toArray();
    res.json(faqs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
});

app.post("/faqs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const faq = { ...req.body, createdAt: new Date() };
    const result = await db.collection("faqs").insertOne(faq);
    res.status(201).json({ ...faq, _id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: "Failed to create FAQ" });
  }
});

app.delete("/faqs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("faqs").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "FAQ not found" });
    res.json({ message: "FAQ deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete FAQ" });
  }
});

// ============================================
// IMAGE UPLOAD (multipart/form-data)
// ============================================
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Invalid file type. Only images are allowed." });
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const imgbbKey = process.env.NEXT_IMAGE || process.env.IMGBB_API_KEY;
    if (!imgbbKey) return res.status(500).json({ error: "Image upload service not configured" });

    const body = new FormData();
    body.append("key", imgbbKey);
    body.append("image", base64);

    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
    const data = await response.json();

    if (!data.success || !data?.data?.url) {
      return res.status(500).json({ error: data?.error?.message || "Upload failed" });
    }

    res.json({ url: data.data.url, thumb: data.data.thumb?.url || data.data.url, deleteUrl: data.data.delete_url });
  } catch (error) {
    console.error("/upload error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ============================================
// START SERVER
// ============================================
connectDB().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Backend running on port ${port}`);
  });
}).catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});
