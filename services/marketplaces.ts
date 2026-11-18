import { Router } from 'express';
import { UniqueConstraintError, col, fn } from 'sequelize';
import { Marketplace } from '../models/Marketplace.js';
import { handleError } from '../utils/common.js';

// The user's marketplaces (Settings). New expenses whose description starts
// with one of them get it as their merchant (utils/marketplaces.ts).
const router = Router();

const MAX_NAME = 100;

router.get('/', async (req, res) => {
  try {
    const marketplaces = await Marketplace.findAll({
      where: { userId: req.userId },
      attributes: ['id', 'name'],
      // Alphabetical whatever the case, so "eBay" sits among the e's.
      order: [[fn('lower', col('name')), 'ASC']],
    });
    res.json(marketplaces);
  } catch (error) {
    handleError(res, error, 'Failed to get marketplaces');
  }
});

router.post('/', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > MAX_NAME) {
    return res.status(400).json({ error: `A name of 1 to ${MAX_NAME} characters is needed` });
  }
  try {
    const marketplace = await Marketplace.create({ name, userId: req.userId });
    res.status(201).json({ id: marketplace.id, name: marketplace.name });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: 'That marketplace is already on the list' });
    }
    handleError(res, error, 'Failed to add marketplace');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Marketplace.destroy({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!deleted) return res.status(404).json({ error: 'Marketplace not found' });
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete marketplace');
  }
});

export default router;
