/**
 * MongoDB Data API Routes
 * Direct cloud syncing for Expenses, Locations, Contacts, Categories, and Message Logs.
 */
import { Router, Request, Response } from 'express';
import {
  UserModel,
  CategoryModel,
  ExpenseModel,
  PinnedLocationModel,
  ContactModel,
  MessageLogModel,
} from '../models';
import logger from '../utils/logger';

const router = Router();

// ==================== EXPENSES ====================

// GET /api/data/expenses?userId=...
router.get('/expenses', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate, categoryId } = req.query;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const query: any = { userId: String(userId) };
    if (startDate && endDate) {
      query.date = { $gte: String(startDate), $lte: String(endDate) };
    } else if (startDate) {
      query.date = { $gte: String(startDate) };
    } else if (endDate) {
      query.date = { $lte: String(endDate) };
    }
    if (categoryId) {
      query.categoryId = String(categoryId);
    }

    const expenses = await ExpenseModel.find(query).sort({ date: -1, createdAt: -1 });
    res.json({ success: true, data: expenses });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch expenses from MongoDB');
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/data/expenses
router.post('/expenses', async (req: Request, res: Response) => {
  try {
    const { userId, categoryId, categoryName, categoryIcon, categoryColor, amount, date, note } = req.body;
    const expense = new ExpenseModel({
      userId: String(userId),
      categoryId: String(categoryId),
      categoryName,
      categoryIcon,
      categoryColor,
      amount: Number(amount),
      date: String(date),
      note,
    });
    await expense.save();
    res.json({ success: true, data: expense });
  } catch (error: any) {
    logger.error({ error }, 'Failed to create expense in MongoDB');
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/data/expenses/:id
router.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    await ExpenseModel.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { message: 'Expense deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LOCATIONS ====================

// GET /api/data/locations?userId=...
router.get('/locations', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    const locations = await PinnedLocationModel.find({ userId: String(userId) }).sort({ createdAt: -1 });
    res.json({ success: true, data: locations });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/data/locations
router.post('/locations', async (req: Request, res: Response) => {
  try {
    const { userId, name, latitude, longitude, radius, autoSend, messageTemplate, assignedContactIds } = req.body;
    const location = new PinnedLocationModel({
      userId: String(userId),
      name: String(name),
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius: Number(radius) || 200,
      autoSend: autoSend !== undefined ? Boolean(autoSend) : true,
      messageTemplate: messageTemplate || 'Reached {location} at {time}.',
      assignedContactIds: assignedContactIds || [],
    });
    await location.save();
    res.json({ success: true, data: location });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/data/locations/:id
router.delete('/locations/:id', async (req: Request, res: Response) => {
  try {
    await PinnedLocationModel.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { message: 'Location deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONTACTS ====================

// GET /api/data/contacts?userId=...
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    const contacts = await ContactModel.find({ userId: String(userId) }).sort({ name: 1 });
    res.json({ success: true, data: contacts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/data/contacts
router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { userId, name, phone, isGroup, groupId } = req.body;
    const contact = new ContactModel({
      userId: String(userId),
      name: String(name),
      phone: String(phone),
      isGroup: Boolean(isGroup),
      groupId: groupId || null,
    });
    await contact.save();
    res.json({ success: true, data: contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/data/contacts/:id
router.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    await ContactModel.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { message: 'Contact deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
