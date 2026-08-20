/**
 * Mongoose Models for Cloud MongoDB Storage
 */
import mongoose, { Schema, Document } from 'mongoose';

// User Schema
export interface IUser extends Document {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Date;
}
const UserSchema = new Schema<IUser>({
  uid: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true },
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
});
export const UserModel = mongoose.model<IUser>('User', UserSchema);

// Category Schema
export interface ICategory extends Document {
  userId: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: Date;
}
const CategorySchema = new Schema<ICategory>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  icon: { type: String, default: 'cash' },
  color: { type: String, default: '#4F46E5' },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
export const CategoryModel = mongoose.model<ICategory>('Category', CategorySchema);

// Expense Schema
export interface IExpense extends Document {
  userId: string;
  categoryId: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}
const ExpenseSchema = new Schema<IExpense>({
  userId: { type: String, required: true, index: true },
  categoryId: { type: String, required: true },
  categoryName: { type: String },
  categoryIcon: { type: String },
  categoryColor: { type: String },
  amount: { type: Number, required: true },
  date: { type: String, required: true, index: true },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
export const ExpenseModel = mongoose.model<IExpense>('Expense', ExpenseSchema);

// Pinned Location Schema
export interface IPinnedLocation extends Document {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  autoSend: boolean;
  messageTemplate: string;
  assignedContactIds: string[];
  activeDays?: string[];
  resetTime?: string;
  createdAt: Date;
}
const PinnedLocationSchema = new Schema<IPinnedLocation>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radius: { type: Number, default: 200 },
  autoSend: { type: Boolean, default: true },
  messageTemplate: { type: String, default: 'Reached {location} at {time}.' },
  assignedContactIds: [{ type: String }],
  activeDays: { type: [String], default: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
  resetTime: { type: String, default: '12:00 AM' },
  createdAt: { type: Date, default: Date.now },
});
export const PinnedLocationModel = mongoose.model<IPinnedLocation>('PinnedLocation', PinnedLocationSchema);

// Contact Schema
export interface IContact extends Document {
  userId: string;
  name: string;
  phone: string;
  isGroup: boolean;
  groupId?: string;
  createdAt: Date;
}
const ContactSchema = new Schema<IContact>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  isGroup: { type: Boolean, default: false },
  groupId: { type: String },
  createdAt: { type: Date, default: Date.now },
});
export const ContactModel = mongoose.model<IContact>('Contact', ContactSchema);

// Message Log Schema
export interface IMessageLog extends Document {
  userId: string;
  locationId?: string;
  contactId?: string;
  locationName: string;
  recipientName: string;
  recipientPhone: string;
  messageContent: string;
  status: string;
  errorMessage?: string;
  sentAt: Date;
}
const MessageLogSchema = new Schema<IMessageLog>({
  userId: { type: String, required: true, index: true },
  locationId: { type: String },
  contactId: { type: String },
  locationName: { type: String, required: true },
  recipientName: { type: String, required: true },
  recipientPhone: { type: String, required: true },
  messageContent: { type: String, required: true },
  status: { type: String, default: 'pending' },
  errorMessage: { type: String },
  sentAt: { type: Date, default: Date.now },
});
export const MessageLogModel = mongoose.model<IMessageLog>('MessageLog', MessageLogSchema);

// Loan & Debt Schema (Khata / Udhaar)
export interface ILoan extends Document {
  userId: string;
  personName: string;
  personPhone: string;
  type: 'lent' | 'borrowed'; // 'lent' = I gave loan (to receive), 'borrowed' = I took loan (I owe)
  amount: number;
  amountRepaid: number;
  date: string;
  dueDate?: string;
  note?: string;
  status: 'pending' | 'partially_paid' | 'settled';
  autoNotify: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const LoanSchema = new Schema<ILoan>({
  userId: { type: String, required: true, index: true },
  personName: { type: String, required: true },
  personPhone: { type: String, required: true },
  type: { type: String, enum: ['lent', 'borrowed'], required: true, index: true },
  amount: { type: Number, required: true },
  amountRepaid: { type: Number, default: 0 },
  date: { type: String, required: true, index: true },
  dueDate: { type: String },
  note: { type: String },
  status: { type: String, enum: ['pending', 'partially_paid', 'settled'], default: 'pending', index: true },
  autoNotify: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
export const LoanModel = mongoose.model<ILoan>('Loan', LoanSchema);
