// require("dotenv").config();
// const cors = require("cors");
// let helmet;
// try {
//   helmet = require("helmet");
// } catch (e) {
//   console.warn("Helmet not installed; continuing without helmet middleware");
// }
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const express = require("express");
// const multer = require("multer");
// const app = express();
// const port = process.env.PORT || 5000;

// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap so a huge upload can't crash the process
// });

// let stripe;
// try {
//   if (process.env.STRIPE_SECRET_KEY) {
//     stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
//   } else {
//     console.warn("STRIPE_SECRET_KEY missing; running in mock checkout mode");
//   }
// } catch (e) {
//   console.warn("Stripe not installed; running in mock checkout mode");
// }

// app.use(cors());
// if (helmet) app.use(helmet());
// app.use(express.json({ limit: "10mb" }));

// app.use((req, res, next) => {
//   const url = req.url;
//   if (!url.startsWith("/api/") && url !== "/") {
//     req.url = `/api${url}`;
//   }
//   next();
// });

// // ---------------------------------------------------------------------------
// // MongoDB connection
// //
// // FIX 1: new MongoClient(undefined) throws synchronously and crashes the
// // process at import time (fatal on Vercel cold start). We now validate the
// // URI up front and fail with a clear, catchable error instead of an opaque
// // crash.
// //
// // FIX 2: connectDB() used to be fire-and-forget. Any request that arrived
// // before the connection resolved hit `db.collection(...)` on an undefined
// // `db` and threw. We now cache the connection promise and every route waits
// // on it via the `ensureDB` middleware below — this also makes reconnects on
// // serverless cold starts safe/idempotent.
// // ---------------------------------------------------------------------------
// const uri = process.env.MONGODB_URL;
// if (!uri) {
//   console.warn("Warning: MONGODB_URL is not set. All DB-backed routes will return 503.");
// }

// let client;
// let db;
// let connectPromise;

// function connectDB() {
//   if (!uri) {
//     return Promise.reject(new Error("MONGODB_URL is not configured"));
//   }
//   if (db) return Promise.resolve(db);
//   if (connectPromise) return connectPromise;

//   client = new MongoClient(uri, {
//     serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
//   });

//   connectPromise = client
//     .connect()
//     .then(() => {
//       db = client.db("e-commerce");
//       console.log("✅ MongoDB Connected");
//       return db;
//     })
//     .catch((err) => {
//       connectPromise = null; // allow retry on next request
//       throw err;
//     });

//   return connectPromise;
// }

// // Kick off an initial connection attempt at boot (non-fatal if it fails).
// connectDB().catch((err) => console.error("Initial MongoDB connection failed:", err.message));

// // Every /api route waits for a ready DB connection instead of assuming one.
// app.use("/api", async (req, res, next) => {
//   try {
//     await connectDB();
//     next();
//   } catch (e) {
//     console.error("DB unavailable:", e.message);
//     res.status(503).json({ error: "Database unavailable" });
//   }
// });

// // ---------------------------------------------------------------------------
// // Auth
// //
// // NOTE (security): this trusts x-user-id / x-user-email / x-user-role
// // headers as-is. That's only safe if a trusted layer in front of this
// // service (e.g. an auth gateway/reverse proxy) sets these headers itself and
// // strips/overwrites anything the client sends. If this API is ever reachable
// // directly by the public internet, anyone can set x-user-role: admin and
// // get admin access. Flagging this because it's the single biggest risk in
// // the file — worth verifying your deployment topology actually enforces it.
// // ---------------------------------------------------------------------------
// const requireAuth = (req, res, next) => {
//   const userId = req.header("x-user-id");
//   const email = req.header("x-user-email");
//   if (!userId || !email) return res.status(401).json({ error: "Unauthorized" });
//   req.user = { id: userId, email, role: req.header("x-user-role") || "user" };
//   next();
// };

// const requireAdmin = (req, res, next) => {
//   if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
//   next();
// };

// // Helper: validate a MongoDB ObjectId param before using it, so a malformed
// // id (e.g. "undefined" from a bad frontend call) returns 400 instead of
// // throwing inside the route and bubbling to the generic 500 handler.
// const parseObjectId = (id, res) => {
//   if (!ObjectId.isValid(id)) {
//     res.status(400).json({ error: "Invalid id" });
//     return null;
//   }
//   return new ObjectId(id);
// };

// app.get("/", (req, res) => res.send("Backend Running"));

// app.get("/api/products", async (req, res) => {
//   try {
//     const { category, search, sort, page = 1, limit = 20 } = req.query;
//     const query = {};
//     if (category && category !== "All") query.category = category;
//     if (search) {
//       query.$or = [
//         { title: { $regex: search, $options: "i" } },
//         { category: { $regex: search, $options: "i" } },
//         { description: { $regex: search, $options: "i" } },
//       ];
//     }
//     let sortOption = { createdAt: -1 };
//     if (sort === "price-asc") sortOption = { price: 1 };
//     else if (sort === "price-desc") sortOption = { price: -1 };
//     else if (sort === "rating") sortOption = { rating: -1 };

//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
//     const skip = (pageNum - 1) * limitNum;

//     const [products, total] = await Promise.all([
//       db.collection("products").find(query).sort(sortOption).skip(skip).limit(limitNum).toArray(),
//       db.collection("products").countDocuments(query),
//     ]);
//     res.json({ products, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
//   } catch (e) {
//     console.error("GET /api/products error:", e);
//     res.status(500).json({ error: "Failed to fetch products" });
//   }
// });

// app.get("/api/products/:id", async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const product = await db.collection("products").findOne({ _id: oid });
//     if (!product) return res.status(404).json({ error: "Product not found" });
//     res.json(product);
//   } catch (e) {
//     console.error("GET /api/products/:id error:", e);
//     res.status(500).json({ error: "Failed to fetch product" });
//   }
// });

// app.post("/api/products", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     if (!req.body || !req.body.title) {
//       return res.status(400).json({ error: "Product title is required" });
//     }
//     const product = { ...req.body, createdAt: new Date() };
//     const result = await db.collection("products").insertOne(product);
//     res.status(201).json({ ...product, _id: result.insertedId });
//   } catch (e) {
//     console.error("POST /api/products error:", e);
//     res.status(500).json({ error: "Failed to create product" });
//   }
// });

// app.put("/api/products/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const updates = { ...req.body, updatedAt: new Date() };
//     delete updates._id;
//     const result = await db.collection("products").updateOne({ _id: oid }, { $set: updates });
//     if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Updated" });
//   } catch (e) {
//     console.error("PUT /api/products/:id error:", e);
//     res.status(500).json({ error: "Failed to update" });
//   }
// });

// app.delete("/api/products/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const result = await db.collection("products").deleteOne({ _id: oid });
//     if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Deleted" });
//   } catch (e) {
//     console.error("DELETE /api/products/:id error:", e);
//     res.status(500).json({ error: "Failed to delete" });
//   }
// });

// app.get("/api/categories", async (req, res) => {
//   try {
//     const categories = await db.collection("products").distinct("category");
//     res.json(categories);
//   } catch (e) {
//     console.error("GET /api/categories error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.post("/api/checkout", requireAuth, async (req, res) => {
//   try {
//     const { items, total } = req.body || {};
//     if (!items || !items.length) return res.status(400).json({ error: "Cart is empty" });

//     const toNumber = (price) => {
//       const n = parseFloat(String(price).replace(/[^0-9.]/g, ""));
//       return isNaN(n) ? 0 : n;
//     };

//     const order = {
//       userId: req.user.id,
//       email: req.user.email,
//       items: items.map((i) => ({
//         id: i.id,
//         title: i.title || i.name,
//         price: i.price,
//         image: i.image,
//         quantity: i.quantity || 1,
//       })),
//       total: toNumber(total) || items.reduce((sum, i) => sum + toNumber(i.price) * (i.quantity || 1), 0),
//       status: "Pending",
//       createdAt: new Date(),
//     };
//     const result = await db.collection("orders").insertOne(order);
//     const orderId = result.insertedId.toString();

//     if (!stripe) {
//       return res.json({ url: `/success?session_id=mock_${Date.now()}`, orderId });
//     }

//     const lineItems = items.map((item) => {
//       const amount = Math.round(toNumber(item.price) * 100);
//       return {
//         price_data: {
//           currency: "usd",
//           product_data: {
//             name: item.title || item.name,
//             images: item.image ? [item.image] : [],
//           },
//           unit_amount: amount,
//         },
//         quantity: item.quantity || 1,
//       };
//     });

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ["card"],
//       line_items: lineItems,
//       mode: "payment",
//       success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
//       cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout`,
//       metadata: { orderId },
//     });

//     res.json({ url: session.url, orderId });
//   } catch (e) {
//     console.error("Checkout error:", e);
//     res.status(500).json({ error: "Checkout failed" });
//   }
// });

// app.post("/api/orders", requireAuth, async (req, res) => {
//   try {
//     const order = { ...req.body, userId: req.user.id, email: req.user.email, status: "Processing", createdAt: new Date() };
//     const result = await db.collection("orders").insertOne(order);
//     res.status(201).json({ ...order, _id: result.insertedId });
//   } catch (e) {
//     console.error("POST /api/orders error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/orders", requireAuth, async (req, res) => {
//   try {
//     const query = req.user.role === "admin" ? {} : { userId: req.user.id };
//     const orders = await db.collection("orders").find(query).sort({ createdAt: -1 }).toArray();
//     res.json({ orders });
//   } catch (e) {
//     console.error("GET /api/orders error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/orders/:id", requireAuth, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const order = await db.collection("orders").findOne({ _id: oid });
//     if (!order) return res.status(404).json({ error: "Not found" });
//     if (order.userId !== req.user.id && req.user.role !== "admin") {
//       return res.status(403).json({ error: "Forbidden" });
//     }
//     res.json(order);
//   } catch (e) {
//     console.error("GET /api/orders/:id error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.put("/api/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const { status } = req.body || {};
//     if (!status) return res.status(400).json({ error: "status is required" });
//     const result = await db.collection("orders").updateOne({ _id: oid }, { $set: { status, updatedAt: new Date() } });
//     if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Updated" });
//   } catch (e) {
//     console.error("PUT /api/orders/:id/status error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/wishlist", requireAuth, async (req, res) => {
//   try {
//     const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
//     res.json({ items: doc?.items || [] });
//   } catch (e) {
//     console.error("GET /api/wishlist error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.post("/api/wishlist", requireAuth, async (req, res) => {
//   try {
//     const { product } = req.body || {};
//     if (!product || !product.id) return res.status(400).json({ error: "product is required" });
//     const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
//     const items = doc?.items || [];
//     const exists = items.some((i) => i.id === product.id);
//     const updated = exists ? items.filter((i) => i.id !== product.id) : [...items, product];
//     await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: updated, updatedAt: new Date() } }, { upsert: true });
//     res.json({ items: updated, removed: exists });
//   } catch (e) {
//     console.error("POST /api/wishlist error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.delete("/api/wishlist", requireAuth, async (req, res) => {
//   try {
//     await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } }, { upsert: true });
//     res.json({ items: [] });
//   } catch (e) {
//     console.error("DELETE /api/wishlist error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/admin/customers", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const users = await db
//       .collection("user")
//       .find({}, { projection: { name: 1, email: 1, image: 1, role: 1, emailVerified: 1, createdAt: 1 } })
//       .sort({ createdAt: -1 })
//       .toArray();
//     res.json({ users: users.map((u) => ({ ...u, _id: u._id.toString() })) });
//   } catch (e) {
//     console.error("GET /api/admin/customers error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// // ---- blog (kept both /api/blog and /api/blogs since the frontend may use either) ----
// async function getBlogHandler(req, res) {
//   try {
//     const { slug, id } = req.query;
//     if (slug) {
//       const post = await db.collection("blog").findOne({ slug });
//       if (!post) return res.status(404).json({ error: "Not found" });
//       return res.json(post);
//     }
//     if (id) {
//       const oid = parseObjectId(id, res);
//       if (!oid) return;
//       const post = await db.collection("blog").findOne({ _id: oid });
//       if (!post) return res.status(404).json({ error: "Not found" });
//       return res.json(post);
//     }
//     const posts = await db.collection("blog").find({}).sort({ createdAt: -1 }).toArray();
//     res.json({ posts });
//   } catch (e) {
//     console.error("GET blog error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// }

// async function postBlogHandler(req, res) {
//   try {
//     const { title, excerpt, content, coverImage, tags, published, slug } = req.body || {};
//     if (!title || !content) return res.status(400).json({ error: "title and content are required" });
//     const blog = {
//       title,
//       slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
//       excerpt: excerpt || content.slice(0, 140),
//       content,
//       coverImage: coverImage || "",
//       author: req.user.email,
//       tags: Array.isArray(tags) ? tags : [],
//       published: !!published,
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     };
//     const result = await db.collection("blog").insertOne(blog);
//     res.status(201).json({ ...blog, id: result.insertedId.toString() });
//   } catch (e) {
//     console.error("POST blog error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// }

// app.get("/api/blog", getBlogHandler);
// app.post("/api/blog", requireAuth, requireAdmin, postBlogHandler);
// app.get("/api/blogs", getBlogHandler);
// app.post("/api/blogs", requireAuth, requireAdmin, postBlogHandler);

// app.put("/api/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const updates = { ...req.body, updatedAt: new Date() };
//     delete updates._id;
//     const result = await db.collection("blog").updateOne({ _id: oid }, { $set: updates });
//     if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Updated" });
//   } catch (e) {
//     console.error("PUT /api/blogs/:id error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.delete("/api/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const result = await db.collection("blog").deleteOne({ _id: oid });
//     if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Deleted" });
//   } catch (e) {
//     console.error("DELETE /api/blogs/:id error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/testimonials", async (req, res) => {
//   try {
//     const testimonials = await db.collection("testimonials").find({}).sort({ createdAt: -1 }).toArray();
//     res.json(testimonials);
//   } catch (e) {
//     console.error("GET /api/testimonials error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.post("/api/testimonials", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const result = await db.collection("testimonials").insertOne({ ...req.body, createdAt: new Date() });
//     res.status(201).json({ ...req.body, _id: result.insertedId });
//   } catch (e) {
//     console.error("POST /api/testimonials error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.delete("/api/testimonials/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const result = await db.collection("testimonials").deleteOne({ _id: oid });
//     if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Deleted" });
//   } catch (e) {
//     console.error("DELETE /api/testimonials/:id error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.get("/api/faqs", async (req, res) => {
//   try {
//     const faqs = await db.collection("faqs").find({}).sort({ order: 1 }).toArray();
//     res.json(faqs);
//   } catch (e) {
//     console.error("GET /api/faqs error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.post("/api/faqs", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const result = await db.collection("faqs").insertOne({ ...req.body, createdAt: new Date() });
//     res.status(201).json({ ...req.body, _id: result.insertedId });
//   } catch (e) {
//     console.error("POST /api/faqs error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.delete("/api/faqs/:id", requireAuth, requireAdmin, async (req, res) => {
//   try {
//     const oid = parseObjectId(req.params.id, res);
//     if (!oid) return;
//     const result = await db.collection("faqs").deleteOne({ _id: oid });
//     if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
//     res.json({ message: "Deleted" });
//   } catch (e) {
//     console.error("DELETE /api/faqs/:id error:", e);
//     res.status(500).json({ error: "Failed" });
//   }
// });

// app.post("/api/upload", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ error: "No file" });
//     const base64 = req.file.buffer.toString("base64");
//     const imgbbKey = process.env.NEXT_IMAGE || process.env.IMGBB_API_KEY;
//     if (!imgbbKey) return res.status(500).json({ error: "Upload not configured" });

//     const formData = new FormData();
//     formData.append("key", imgbbKey);
//     formData.append("image", base64);

//     const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
//     const data = await response.json();

//     if (!data.success || !data?.data?.url) {
//       console.error("imgbb error:", data);
//       return res.status(500).json({ error: data?.error?.message || "Upload failed" });
//     }
//     res.json({ url: data.data.url, thumb: data.data.thumb?.url || data.data.url });
//   } catch (e) {
//     console.error("Upload exception:", e);
//     res.status(500).json({ error: "Upload failed" });
//   }
// });

// app.post("/api/auth/get-session", (req, res) => {
//   res.status(200).json({ user: null, session: null });
// });

// app.post("/api/auth/sign-in/social", (req, res) => {
//   res.status(200).json({ message: "Social sign-in not configured", user: null });
// });

// // FIX: this project runs on Express 5 (path-to-regexp v6+). Both ":path*"
// // AND a bare "*" now throw "Missing parameter name" at route-registration
// // time — i.e. at module load, before any request is even handled, which is
// // exactly why every single request (including "/" and "/favicon.ico") was
// // crashing with a 500. A plain string mount path has no wildcard token for
// // path-to-regexp to choke on, so it's safe on both Express 4 and 5.
// app.use("/api/auth", (req, res) => {
//   res.status(501).json({ error: "Auth endpoint not implemented" });
// });

// // 404 for any other /api route that wasn't matched above.
// app.use("/api", (req, res) => {
//   res.status(404).json({ error: "Not found" });
// });

// app.use((err, req, res, next) => {
//   console.error("Unhandled server error:", err);
//   res.status(500).json({ error: "Internal server error" });
// });

// process.on("unhandledRejection", (err) => {
//   console.error("Unhandled promise rejection:", err);
// });

// // FIX: exiting the process on every uncaught exception is what turns a
// // single bad request into a full outage on a long-running server. We now
// // just log it — the request that caused it will fail, but the process
// // (and every other in-flight request) survives.
// process.on("uncaughtException", (err) => {
//   console.error("Uncaught exception:", err);
// });

// process.on("SIGINT", async () => {
//   console.log("🛑 SIGINT received, closing MongoDB connection...");
//   try {
//     if (client) await client.close();
//   } catch (e) {
//     console.error("Error closing MongoDB client:", e);
//   }
//   process.exit(0);
// });

// process.on("SIGTERM", async () => {
//   console.log("🛑 SIGTERM received, closing MongoDB connection...");
//   try {
//     if (client) await client.close();
//   } catch (e) {
//     console.error("Error closing MongoDB client:", e);
//   }
//   process.exit(0);
// });

// if (require.main === module) {
//   app.listen(port, "0.0.0.0", () => console.log(`🚀 Backend running on port ${port}`));
// }

// module.exports = app;



























require("dotenv").config();
const cors = require("cors");
let helmet;
try {
  helmet = require("helmet");
} catch (e) {
  console.warn("Helmet not installed; continuing without helmet middleware");
}
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const multer = require("multer");
const app = express();
const port = process.env.PORT || 5000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

let stripe;
try {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
} catch (e) {
  console.warn("Stripe not installed or STRIPE_SECRET_KEY missing");
}

app.use(cors());
if (helmet) app.use(helmet());
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  const url = req.url;
  if (!url.startsWith("/api/") && url !== "/") {
    req.url = `/api${url}`;
  }
  next();
});

const uri = process.env.MONGODB_URL;
if (!uri) {
  console.warn("Warning: MONGODB_URL is not set. Database connection may fail in production.");
}
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

app.get("/api/products", async (req, res) => {
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
    console.error("GET /api/products error:", e);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (e) {
    console.error("GET /api/products/:id error:", e);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

app.post("/api/products", requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = { ...req.body, createdAt: new Date() };
    const result = await db.collection("products").insertOne(product);
    res.status(201).json({ ...product, _id: result.insertedId });
  } catch (e) {
    console.error("POST /api/products error:", e);
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
    console.error("PUT /api/products/:id error:", e);
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/products/:id error:", e);
    res.status(500).json({ error: "Failed to delete" });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await db.collection("products").distinct("category");
    res.json(categories);
  } catch (e) {
    console.error("GET /api/categories error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/checkout", requireAuth, async (req, res) => {
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

app.post("/api/orders", requireAuth, async (req, res) => {
  try {
    const order = { ...req.body, userId: req.user.id, email: req.user.email, status: "Processing", createdAt: new Date() };
    const result = await db.collection("orders").insertOne(order);
    res.status(201).json({ ...order, _id: result.insertedId });
  } catch (e) {
    console.error("POST /api/orders error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { userId: req.user.id };
    const orders = await db.collection("orders").find(query).sort({ createdAt: -1 }).toArray();
    res.json({ orders });
  } catch (e) {
    console.error("GET /api/orders error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/orders/:id", requireAuth, async (req, res) => {
  try {
    const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ error: "Not found" });
    if (order.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(order);
  } catch (e) {
    console.error("GET /api/orders/:id error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.put("/api/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await db.collection("orders").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Updated" });
  } catch (e) {
    console.error("PUT /api/orders/:id/status error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
    res.json({ items: doc?.items || [] });
  } catch (e) {
    console.error("GET /api/wishlist error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/wishlist", requireAuth, async (req, res) => {
  try {
    const { product } = req.body;
    const doc = await db.collection("wishlist").findOne({ userId: req.user.id });
    const items = doc?.items || [];
    const exists = items.some((i) => i.id === product.id);
    const updated = exists ? items.filter((i) => i.id !== product.id) : [...items, product];
    await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: updated, updatedAt: new Date() } }, { upsert: true });
    res.json({ items: updated, removed: exists });
  } catch (e) {
    console.error("POST /api/wishlist error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/api/wishlist", requireAuth, async (req, res) => {
  try {
    await db.collection("wishlist").updateOne({ userId: req.user.id }, { $set: { items: [], updatedAt: new Date() } }, { upsert: true });
    res.json({ items: [] });
  } catch (e) {
    console.error("DELETE /api/wishlist error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/admin/customers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.collection("user").find({}, { projection: { name: 1, email: 1, image: 1, role: 1, emailVerified: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray();
    res.json({ users: users.map(u => ({ ...u, _id: u._id.toString() })) });
  } catch (e) {
    console.error("GET /api/admin/customers error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/blog", async (req, res) => {
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
    console.error("GET /api/blog error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/blog", requireAuth, requireAdmin, async (req, res) => {
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
    console.error("POST /api/blog error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/blogs", async (req, res) => {
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
    console.error("GET /api/blogs error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/blogs", requireAuth, requireAdmin, async (req, res) => {
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
    console.error("POST /api/blogs error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.put("/api/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("blog").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...req.body, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Updated" });
  } catch (e) {
    console.error("PUT /api/blogs/:id error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/api/blogs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("blog").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/blogs/:id error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/testimonials", async (req, res) => {
  try {
    const testimonials = await db.collection("testimonials").find({}).sort({ createdAt: -1 }).toArray();
    res.json(testimonials);
  } catch (e) {
    console.error("GET /api/testimonials error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/testimonials", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("testimonials").insertOne({ ...req.body, createdAt: new Date() });
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (e) {
    console.error("POST /api/testimonials error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/api/testimonials/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("testimonials").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/testimonials/:id error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.get("/api/faqs", async (req, res) => {
  try {
    const faqs = await db.collection("faqs").find({}).sort({ order: 1 }).toArray();
    res.json(faqs);
  } catch (e) {
    console.error("GET /api/faqs error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/faqs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("faqs").insertOne({ ...req.body, createdAt: new Date() });
    res.status(201).json({ ...req.body, _id: result.insertedId });
  } catch (e) {
    console.error("POST /api/faqs error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.delete("/api/faqs/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.collection("faqs").deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("DELETE /api/faqs/:id error:", e);
    res.status(500).json({ error: "Failed" });
  }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const base64 = req.file.buffer.toString("base64");
    const imgbbKey = process.env.NEXT_IMAGE || process.env.IMGBB_API_KEY;
    if (!imgbbKey) return res.status(500).json({ error: "Upload not configured" });

    const formData = new FormData();
    formData.append("key", imgbbKey);
    formData.append("image", base64);

    const response = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: formData });
    const data = await response.json();

    if (!data.success || !data?.data?.url) {
      console.error("imgbb error:", data);
      return res.status(500).json({ error: data?.error?.message || "Upload failed" });
    }
    res.json({ url: data.data.url, thumb: data.data.thumb?.url || data.data.url });
  } catch (e) {
    console.error("Upload exception:", e);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.post("/api/auth/get-session", (req, res) => {
  res.status(200).json({ user: null, session: null });
});

app.post("/api/auth/sign-in/social", (req, res) => {
  res.status(200).json({ message: "Social sign-in not configured", user: null });
});

app.use("/api/auth/:path*", (req, res) => {
  res.status(501).json({ error: "Auth endpoint not implemented" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled promise rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

connectDB().catch((err) => {
  console.error("MongoDB Error:", err);
});

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received, closing MongoDB connection...");
  try {
    await client.close();
  } catch (e) {
    console.error("Error closing MongoDB client:", e);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, closing MongoDB connection...");
  try {
    await client.close();
  } catch (e) {
    console.error("Error closing MongoDB client:", e);
  }
  process.exit(0);
});

if (require.main === module) {
  app.listen(port, "0.0.0.0", () => console.log(`🚀 Backend running on port ${port}`));
}

module.exports = app;
