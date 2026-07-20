const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const multer = require("multer");
const app = express();
const port = process.env.PORT || 5000;

// Stripe
let stripe;
try {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn("Stripe not installed or STRIPE_SECRET_KEY missing");
}

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      origin,
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "https://e-commarce-client-five.vercel.app",
      "https://e-commarce-server-sand.vercel.app",
    ].filter(Boolean);
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());

const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});

let db;
async function connectDB() {
  await client.connect();
  db = client.db("e-commerce");
  console.log("✅ MongoDB Connected");
}

const requireAuth = (req, res, next) => {
  const userId = req.header("x-user-id");
  const email = req.header("x-user-email");
  if (!userId || !email) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: userId, email, role: req.header("x-user-role") || "user" };
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
};

app.get("/", (req, res) => res.send("Backend Running"));

// PRODUCTS
app.get("/products", async (req, res) => {
  try {
    const { category, search, sort, page = 1, limit = 20 } = req.query;
    const query = {};
    if (category && category !== "All") query.category = category;
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
    res.json({ products, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

app.post("/api/products", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = { ...req.body, createdAt: new Date() };
    const result = await db.collection("products").insertOne(product);
    res.status(201).json({ ...product, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.put("/api/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: new Date() };
    const result = await db.collection("products").updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// CATEGORIES
app.get("/categories", async (req, res) => {
  try {
    const categories = await db.collection("products").distinct("category");
    res.json(categories);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// CHECKOUT - creates order + Stripe session
app.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { items, total } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: "Cart is empty" });

    const toNumber = (price) => {
      const n = parseFloat(String(price).replace(/[^0-9.]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const order = {
      userId: req.user.id,
      email: req.user.email,
      items: items.map((i) => ({
        id: i.id,
        title: i.title || i.name,
        price: i.price,
        image: i.image,
        quantity: i.quantity || 1,
      })),
      total: toNumber(total) || items.reduce((sum, i) => sum + toNumber(i.price) * (i.quantity || 1), 0),
      status: "Pending",
      createdAt: new Date(),
    };
    const result = await db.collection("orders").insertOne(order);
    const orderId = result.insertedId.toString();

    if (!stripe) {
      return res.json({ url: `/success?session_id=mock_${Date.now()}`, orderId });
    }

    const lineItems = items.map((item) => {
      const amount = Math.round(toNumber(item.price) * 100);
      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: item.title || item.name,
            images: item.image ? [item.image] : [],
          },
          unit_amount: amount,
        },
        quantity: item.quantity || 1,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout`,
      metadata: { orderId },
    });

    res.json({ url: session.url, orderId });
  } catch (e) {
    console.error("Checkout error:", e);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// ORDERS
app.post("/orders", requireAuth, async (req, res) => {
  try {
    const order = { ...req.body, userId: req.user.id, email: req.user.email, status: "Processing", createdAt: new Date() };
    const result = await db.collection("orders").insertOne(order);
    res.status(201).json({ ...order, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { userId: req.user.id };
    const orders = await db.collection("orders").find(query).sort({ createdAt: -1 }).toArray();
    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.put("/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await db.collection("orders").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// WISHLIST
app.get("/wishlist", requireAuth, async (req, res) => {
  try {
    const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
    res.json({ items: doc?.items || [] });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
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
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/wishlist", requireAuth, async (req, res) => {
  try {
    await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } }, { upsert: true });
    res.json({ items: [] });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// CUSTOMERS
app.get("/admin/customers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.collection("user").find({}, { projection: { name: 1, email: 1, image: 1, role: 1, emailVerified: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray();
    res.json({ users: users.map(u => ({ ...u, _id: u._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// BLOGS
app.get("/blogs", async (req, res) => {
  try {
    const { slug, id } = req.query;
    if (slug) {
      const post = await db.collection("blog").findOne({ slug: slug });
      if (!post) return res.status(404).json({ error: "Not found" });
      return res.json(post);
    }
    if (id) {
      const post = await db.collection("blog").findOne({ _id: new ObjectId(id) });
      if (!post) return res.status(404).json({ error: "Not found" });
      return res.json(post);
    }
    const posts = await db.collection("blog").find({}).sort({ createdAt: -1 }).toArray();
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
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
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.put("/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("blog").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...req.body, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("blog").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// TESTIMONIALS
app.get("/testimonials", async (req, res) => {
  try {
    const testimonials = await db.collection("testimonials").find({}).sort({ createdAt: -1 }).toArray();
    res.json(testimonials);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/testimonials", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("testimonials").insertOne({ ...req.body, createdAt: new Date() });
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/testimonials/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("testimonials").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// FAQs
app.get("/faqs", async (req, res) => {
  try {
    const faqs = await db.collection("faqs").find({}).sort({ order: 1 }).toArray();
    res.json(faqs);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/faqs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("faqs").insertOne({ ...req.body, createdAt: new Date() });
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/faqs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("faqs").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

// UPLOAD
const storage = multer.memoryStorage();
const upload = multer({ storage });

// app.post("/upload", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ error: "No file" });
//     const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
//     const imgbbKey = process.env.NEXT_IMAGE || process.env.IMGBB_API_KEY;
//     if (!imgbbKey) return res.status(500).json({ error: "Upload not configured" });

//     const formData = new FormData();
//     formData.append("key", imgbbKey);
//     formData.append("image", base64);

//     const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
//     const data = await response.json();
//     if (!data.success || !data?.data?.url) return res.status(500).json({ error: data?.error?.message || "Upload failed" });
//     res.json({ url: data.data.url, thumb: data.data.thumb?.url || data.data.url });
//   } catch (e) {
//     res.status(500).json({ error: "Upload failed" });
//   }
// }); 

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    // ✅ imgbb wants raw base64, NOT the data:mime;base64, prefix
    const base64 = req.file.buffer.toString("base64");

    const imgbbKey = process.env.NEXT_IMAGE || process.env.IMGBB_API_KEY;
    if (!imgbbKey) return res.status(500).json({ error: "Upload not configured" });

    const formData = new FormData();
    formData.append("key", imgbbKey);
    formData.append("image", base64);

    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
    const data = await response.json();

    if (!data.success || !data?.data?.url) {
      console.error("imgbb error:", data); // 👈 log this to debug further if issue persists
      return res.status(500).json({ error: data?.error?.message || "Upload failed" });
    }
    res.json({ url: data.data.url, thumb: data.data.thumb?.url || data.data.url });
  } catch (e) {
    console.error("Upload exception:", e); // 👈 also log the actual exception, not just generic message
    res.status(500).json({ error: "Upload failed" });
  }
});

connectDB().then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`🚀 Backend running on port ${port}`));
}).catch((err) => {
  console.error("MongoDB Error:", err);
  process.exit(1);
});
