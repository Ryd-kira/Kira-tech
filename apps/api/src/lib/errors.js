// Erreur métier : code stable lu par l'interface, message lisible, jamais de détail technique.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Connexion requise.'),
  forbidden: () => new AppError(403, 'FORBIDDEN', "Vous n'avez pas l'autorisation d'effectuer cette action."),
  notFound: (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable.`),
  invalidTransition: (message) => new AppError(409, 'INVALID_TRANSITION', message),
  conflict: (code, message) => new AppError(409, code, message),
};

// Suppression refusée par une clé étrangère (onDelete: Restrict) : l'élément a un historique.
export const isReferenced = (err) => err?.code === 'P2003' || /foreign key constraint/i.test(String(err?.message));
