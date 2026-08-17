/**
 * Default expense categories with icons and colors.
 */
import { Colors } from './theme';

export interface Category {
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Food', icon: 'food-fork-drink', color: Colors.categories.food, isDefault: true },
  { name: 'Lunch', icon: 'food', color: Colors.categories.lunch, isDefault: true },
  { name: 'Online Shopping', icon: 'cart-arrow-down', color: Colors.categories.online_shopping, isDefault: true },
  { name: 'Grooming', icon: 'content-cut', color: Colors.categories.grooming, isDefault: true },
  { name: 'Shopping', icon: 'shopping', color: Colors.categories.shopping, isDefault: true },
  { name: 'Grocery', icon: 'cart', color: Colors.categories.grocery, isDefault: true },
  { name: 'Transport', icon: 'bus', color: Colors.categories.transport, isDefault: true },
  { name: 'Rent', icon: 'home', color: Colors.categories.rent, isDefault: true },
  { name: 'Entertainment', icon: 'movie-open', color: Colors.categories.entertainment, isDefault: true },
  { name: 'Health', icon: 'hospital-box', color: Colors.categories.health, isDefault: true },
  { name: 'Education', icon: 'school', color: Colors.categories.education, isDefault: true },
  { name: 'Other', icon: 'dots-horizontal-circle', color: Colors.categories.other, isDefault: true },
];

export const CATEGORY_ICONS = [
  'home', 'food', 'food-fork-drink', 'cart', 'cart-arrow-down', 'content-cut',
  'bus', 'movie-open', 'shopping', 'hospital-box', 'school', 'dots-horizontal-circle',
  'gift', 'cash', 'credit-card', 'phone', 'wifi', 'water',
  'lightning-bolt', 'gas-station', 'airplane', 'bed', 'gym',
  'dog', 'cat', 'flower', 'coffee', 'beer', 'pizza',
];
