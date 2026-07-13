import { Router } from 'express';
import { Op } from 'sequelize';
import { Account } from '../models/Account.js';
import { handleError } from '../utils/common.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const accounts = await Account.findAll({
      where: {
        [Op.or]: [{ isDefault: true }, { userId: req.userId }],
      },
      order: [['name', 'ASC']],
    });

    res.json(accounts);
  } catch (error) {
    handleError(res, error, 'Failed to get accounts');
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, currency } = req.body;
    const newAccount = await Account.create({
      name,
      currency,
      isDefault: false,
      userId: req.userId,
    });

    res.status(201).json(newAccount);
  } catch (error) {
    handleError(res, error, 'Failed to create new account');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const account = await Account.findOne({ where: { id, userId: req.userId } });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.isDefault) {
      return res.status(400).json({ error: 'Cannot delete a default account' });
    }

    await account.destroy();

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete account');
  }
});

export default router;
