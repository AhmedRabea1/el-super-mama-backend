import { Router } from "express";
import { requireAdmin } from "../middlewares/auth.js";
import { uploadImage } from "../middlewares/upload.js";

const router = Router();

// POST /api/admin/uploads/image — multipart/form-data, field name "image".
// Saves the file to disk and returns its public URL, for the admin panel to
// then set as `imageUrl` on a recipe (or anything else) via the existing
// JSON create/update endpoints — this endpoint doesn't touch any DB row.
router.post("/admin/uploads/image", requireAdmin, (req, res) => {
  uploadImage.single("image")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }
    const url = `${req.protocol}://${req.get("host")}/uploads/images/${req.file.filename}`;
    res.status(201).json({ url });
  });
});

export default router;
