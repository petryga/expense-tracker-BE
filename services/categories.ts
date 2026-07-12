import { Router } from 'express';
import { Op } from 'sequelize';
import { Category } from '../models/Category';
import { CategoryBudget } from '../models/CategoryBudget';
import { sequelize } from '../config/database';
import { handleError } from '../utils/common';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: {
        [Op.or]: [{ isDefault: true }, { userId: req.userId }],
      },
      order: [['name', 'ASC']],
    });

    const budgets = await CategoryBudget.findAll({ where: { userId: req.userId } });
    const budgetByCategoryId = new Map(budgets.map((budget) => [budget.categoryId, budget.budget]));

    const result = categories.map((category) => ({
      ...category.toJSON(),
      budget: budgetByCategoryId.get(category.id) ?? null,
    }));

    res.json(result);
  } catch (error) {
    handleError(res, error, 'Failed to get categories');
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, parentCategoryId } = req.body;
    const newCategory = await Category.create({
      name,
      parentCategoryId: parentCategoryId || null,
      isDefault: false,
      userId: req.userId,
    });

    res.status(201).json({ ...newCategory.toJSON(), budget: null });
  } catch (error) {
    handleError(res, error, 'Failed to create new category');
  }
});

router.put('/:id/budget', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const { budget } = req.body;

    const existing = await CategoryBudget.findOne({
      where: { categoryId: id, userId: req.userId },
    });

    const categoryBudget = existing
      ? await existing.update({ budget })
      : await CategoryBudget.create({ categoryId: id, userId: req.userId, budget });

    res.json(categoryBudget);
  } catch (error) {
    handleError(res, error, 'Failed to update category budget');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const category = await Category.findOne({ where: { id, userId: req.userId } });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.isDefault) {
      return res.status(400).json({ error: 'Cannot delete a default category' });
    }

    const subcategories = await Category.findAll({
      where: { parentCategoryId: id, userId: req.userId },
    });
    const idsToRemove = [id, ...subcategories.map((subcategory) => subcategory.id)];

    await sequelize.transaction(async (transaction) => {
      await CategoryBudget.destroy({ where: { categoryId: idsToRemove }, transaction });
      await Category.destroy({ where: { id: idsToRemove }, transaction });
    });

    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'Failed to delete category');
  }
});

export default router;
