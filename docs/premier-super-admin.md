# Créer le premier super administrateur

Il n'existe ni inscription publique ni mot de passe par défaut.

1. Déployer l'API sur Render et appliquer les migrations (`npx prisma migrate deploy`).
2. Ouvrir l'onglet **Shell** du service Render.
3. Lancer `npm run admin:create`.
4. Saisir le nom, l'e-mail et le mot de passe (12 caractères minimum, saisie masquée, demandée deux fois).

Le script refuse de s'exécuter s'il existe déjà un super administrateur. Les comptes suivants se créent depuis l'administration (Administrateurs > Nouveau compte) ; leur titulaire doit changer son mot de passe à la première connexion.

## Mot de passe oublié

Un super administrateur génère un lien à usage unique (Administrateurs > compte > Réinitialiser le mot de passe), valable 30 minutes, et le transmet par un canal sûr. Toutes les sessions du compte sont fermées une fois le nouveau mot de passe enregistré.

Si le seul super administrateur perd son accès : un développeur ayant accès au shell Render peut créer un lien via la base. Cette opération est journalisée.
