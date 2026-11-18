// Création du PREMIER super administrateur. À lancer une seule fois, depuis le shell Render :
//   npm run admin:create
// Aucun mot de passe par défaut : il est saisi au clavier, masqué, puis haché.
import { stdin, stdout } from 'node:process';
import readline from 'node:readline';
import { z } from 'zod';
import { hashPassword, passwordSchema } from '../src/lib/passwords.js';
import { prisma } from '../src/lib/prisma.js';

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) stdout.write(s); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main() {
  const existing = await prisma.adminUser.count({ where: { role: 'SUPER_ADMIN' } });
  if (existing > 0) {
    console.error('Un super administrateur existe déjà. Les autres comptes se créent depuis l\'administration.');
    process.exitCode = 1;
    return;
  }
  const name = z.string().min(2).max(100).parse(await ask('Nom complet : '));
  const email = z.email().parse(await ask('E-mail : ')).toLowerCase();
  const password = await ask('Mot de passe (12 caractères minimum) : ', { hidden: true });
  passwordSchema.parse(password);
  if (password !== (await ask('Confirmez le mot de passe : ', { hidden: true }))) {
    throw new Error('Les deux mots de passe ne correspondent pas.');
  }
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.adminUser.create({
      data: { name, email, role: 'SUPER_ADMIN', passwordHash: await hashPassword(password), mustChangePassword: false },
    });
    await tx.auditLog.create({
      data: { adminUserId: created.id, action: 'user.bootstrap', entityType: 'AdminUser', entityId: created.id,
        newValues: { email, role: 'SUPER_ADMIN' }, reason: 'Création initiale par script' },
    });
    return created;
  });
  console.log(`Super administrateur créé : ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof z.ZodError ? `Saisie invalide : ${err.issues[0].message}` : err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
