import express from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import authHandler from "../api/auth/[...all].js";
import workspaceHandler from "../api/workspace.js";

const app = express();
app.all(/^\/api\/auth\/.*/, authHandler);
app.use(express.json({ limit: "3mb" }));
app.all("/api/workspace", (req, res) => workspaceHandler(req as unknown as VercelRequest, res as unknown as VercelResponse));
app.listen(3001, "0.0.0.0", () => console.info("OpenPlanter local API listening on port 3001"));
