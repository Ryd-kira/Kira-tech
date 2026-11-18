import { AppError } from './errors.js';

// Validation stricte à la frontière : un champ inconnu est refusé (pas d'affectation de masse).
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Certaines informations sont invalides.', details);
  }
  return result.data;
}
