const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URL;
console.log(process.env.MONGODB_URL);
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// ========================================
//         SAMPLE SEED DATA
// ========================================

// ========== PRODUCTS ==========
// const sampleProducts = 

// // ========== TESTIMONIALS ==========
// const sampleTestimonials = [
//   {
// ];

// // ========== FAQs ==========
// const sampleFaqs 

// // ========== BLOGS ==========
// const sampleBlogs 
 

// ========================================
//         SERVER START + SEED + ROUTES
// ========================================

async function run() {
  try {
    await client.connect();
    console.log("✅ MongoDB Connected");

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const db = client.db("e-commerce");
    const productsCollection = db.collection("products");
    const testimonialsCollection = db.collection("testimonials");
    const faqsCollection = db.collection("faqs");
    const blogsCollection = db.collection("blogs");

    // ===== SEED ALL COLLECTIONS =====
    
    // ========================================

    // GET all products
    app.get('/products', async (req, res) => {
      try {
        const products = await productsCollection.find().toArray();
          const result= res.send(products);
          console.log("result",result)
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
      }
    });

    // GET single product by ID
    app.get('/products/:id', async (req, res) => {
      try {
        const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!product) {
          return res.status(404).json({ error: "Product not found" });
        }
        res.send(product);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch product" });
      }
    });

    // POST create a new product
    app.post('/products', async (req, res) => {
      try {
        const newProduct = { ...req.body, createdAt: new Date() };
        const result = await productsCollection.insertOne(newProduct);
        res.status(201).json({ ...newProduct, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to create product" });
      }
    });

    // DELETE a product by ID
    app.delete('/products/:id', async (req, res) => {
      try {
        const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Product not found" });
        }
        res.json({ message: "Product deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete product" });
      }
    });

    // ========================================
    //          TESTIMONIAL ROUTES
    // ========================================

    // GET all testimonials
    app.get('/testimonials', async (req, res) => {
      try {
        const testimonials = await testimonialsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.json(testimonials);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch testimonials" });
      }
    });

    // POST create a new testimonial
    app.post('/testimonials', async (req, res) => {
      try {
        const newTestimonial = { ...req.body, createdAt: new Date() };
        const result = await testimonialsCollection.insertOne(newTestimonial);
        res.status(201).json({ ...newTestimonial, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to create testimonial" });
      }
    });

    // DELETE a testimonial
    app.delete('/testimonials/:id', async (req, res) => {
      try {
        const result = await testimonialsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Testimonial not found" });
        }
        res.json({ message: "Testimonial deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete testimonial" });
      }
    });

    // ========================================
    //              FAQ ROUTES
    // ========================================

    // GET all FAQs
    app.get('/faqs', async (req, res) => {
      try {
        const faqs = await faqsCollection.find({}).sort({ order: 1 }).toArray();
        res.json(faqs);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch FAQs" });
      }
    });

    // POST create a new FAQ
    app.post('/faqs', async (req, res) => {
      try {
        const newFaq = { ...req.body, createdAt: new Date() };
        const result = await faqsCollection.insertOne(newFaq);
        res.status(201).json({ ...newFaq, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to create FAQ" });
      }
    });

    // DELETE a FAQ
    app.delete('/faqs/:id', async (req, res) => {
      try {
        const result = await faqsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "FAQ not found" });
        }
        res.json({ message: "FAQ deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete FAQ" });
      }
    });

    // ========================================
    //             BLOG ROUTES
    // ========================================

    // GET all blogs (latest first)
    app.get('/blogs', async (req, res) => {
      try {
        const blogs = await blogsCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.json(blogs);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch blogs" });
      }
    });

    // GET single blog by ID
    app.get('/blogs/:id', async (req, res) => {
      try {
        const blog = await blogsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!blog) {
          return res.status(404).json({ error: "Blog not found" });
        }
        res.json(blog);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch blog" });
      }
    });

    // POST create a new blog
    app.post('/blogs', async (req, res) => {
      try {
        const newBlog = { ...req.body, createdAt: new Date() };
        const result = await blogsCollection.insertOne(newBlog);
        res.status(201).json({ ...newBlog, _id: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to create blog" });
      }
    });

    // DELETE a blog by ID
    app.delete('/blogs/:id', async (req, res) => {
      try {
        const result = await blogsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Blog not found" });
        }
        res.json({ message: "Blog deleted successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to delete blog" });
      }
    });

  } catch (err) {
    console.error("MongoDB Error:", err);
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});