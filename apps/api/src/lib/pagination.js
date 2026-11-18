import { z } from 'zod';

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};
export const pageResult = (items, total, page, limit) => ({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
