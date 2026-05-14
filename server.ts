import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Price Configuration Persistence with File Fallback
  const PRICES_FILE = path.join(process.cwd(), "prices.json");
  
  // Default values
  const DEFAULT_PRICES = {
    bwTier1: 350,
    bwTier2: 330,
    bwTier3: 300,
    colorTier1: 950,
    colorTier2: 930,
    colorTier3: 900,
    lastUpdated: 0
  };

  let priceConfig = { ...DEFAULT_PRICES };

  // Load initial config from file if exists
  const loadPrices = () => {
    try {
      if (fs.existsSync(PRICES_FILE)) {
        const data = fs.readFileSync(PRICES_FILE, 'utf8');
        const parsed = JSON.parse(data);
        priceConfig = { ...DEFAULT_PRICES, ...parsed };
        console.log("Loaded price config from file:", priceConfig);
      }
    } catch (err) {
      console.error("Failed to load prices file:", err);
    }
  };
  
  loadPrices();

  app.get("/api/prices", (req, res) => {
    res.json(priceConfig);
  });

  app.post("/api/prices", (req, res) => {
    const newConfig = req.body;
    // Basic validation
    if (typeof newConfig === 'object' && newConfig !== null) {
      priceConfig = { ...priceConfig, ...newConfig, lastUpdated: Date.now() };
      
      // Save to file
      try {
        fs.writeFileSync(PRICES_FILE, JSON.stringify(priceConfig, null, 2));
      } catch (err) {
        console.error("Failed to save prices file:", err);
      }
      
      res.json({ success: true, config: priceConfig });
    } else {
      res.status(400).json({ error: "Invalid configuration format" });
    }
  });

  // Proxy endpoint to bypass CORS for artifacts
  app.get("/api/proxy-image", async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("URL is required");
    }

    try {
      console.log("Proxying request for URL:", imageUrl);
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`Upstream returned ${response.status} for ${imageUrl}. Body: ${text.substring(0, 200)}`);
        throw new Error(`Status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type") || "image/png";

      console.log(`Successfully fetched image. Type: ${contentType}, Size: ${buffer.length} bytes`);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buffer);
    } catch (error) {
      console.error("Proxy error for URL", imageUrl, ":", error);
      res.status(500).send(`Error fetching image: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
