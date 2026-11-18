// Point d'entrée Vercel : l'app Express est exportée comme fonction, sans listen().
import { createApp } from '../src/app.js';

export default createApp();
