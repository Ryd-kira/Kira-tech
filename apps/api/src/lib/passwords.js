import bcrypt from 'bcryptjs';
import { z } from 'zod';

const COST = 12;
export const passwordSchema = z.string().min(12, '12 caractères minimum').max(128);
export const hashPassword = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Empreinte factice : un e-mail inconnu coûte le même temps qu'un mauvais mot de passe.
export const DUMMY_HASH = bcrypt.hashSync('kts-dummy-password-never-valid', COST);
