import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// Vérifie réellement la base : Render redémarre le service si elle ne répond pas.
router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
