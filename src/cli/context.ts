import path from 'node:path';
import { defaultStorage } from '../tour/paths.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const STORAGE = defaultStorage();
