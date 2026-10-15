// Seed idempotente: modalidades do catálogo, primeiro admin, atléticas de
// exemplo e um torneio vazio. Rode quantas vezes quiser — só cria o que falta.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SPORTS_CATALOG } from '../shared/sports-catalog';

try {
  process.loadEnvFile();
} catch {
  /* sem .env */
}

const prisma = new PrismaClient();

// Cores/nomes de exemplo — ajuste no painel (Atléticas) com as oficiais.
const INSTITUTIONS = [
  { name: 'CAASO', fullName: 'Centro Acadêmico Armando de Salles Oliveira', university: 'USP São Carlos', city: 'São Carlos', slug: 'caaso', primaryColor: '#b91c1c', secondaryColor: '#111111', flagPattern: 'diagonal' },
  { name: 'UFSCar', fullName: 'Associação Atlética Acadêmica UFSCar', university: 'UFSCar', city: 'São Carlos', slug: 'ufscar', primaryColor: '#1e40af', secondaryColor: '#ffffff', flagPattern: 'stripes' },
  { name: 'Poli', fullName: 'Atlética da Escola Politécnica', university: 'USP', city: 'São Paulo', slug: 'poli', primaryColor: '#0f172a', secondaryColor: '#facc15', flagPattern: 'chevron' },
  { name: 'FEA', fullName: 'Atlética da FEA', university: 'USP', city: 'São Paulo', slug: 'fea', primaryColor: '#065f46', secondaryColor: '#f8fafc', flagPattern: 'split' },
  { name: 'Medicina', fullName: 'Atlética da Faculdade de Medicina', university: 'USP', city: 'São Paulo', slug: 'medicina', primaryColor: '#14532d', secondaryColor: '#fde047', flagPattern: 'cross' },
  { name: 'Direito', fullName: 'Atlética da Faculdade de Direito', university: 'USP', city: 'São Paulo', slug: 'direito', primaryColor: '#7f1d1d', secondaryColor: '#fef3c7', flagPattern: 'stripes' },
  { name: 'ESALQ', fullName: 'Atlética da ESALQ', university: 'USP Piracicaba', city: 'Piracicaba', slug: 'esalq', primaryColor: '#166534', secondaryColor: '#ffffff', flagPattern: 'diagonal' },
  { name: 'FMRP', fullName: 'Atlética da Medicina de Ribeirão Preto', university: 'USP Ribeirão Preto', city: 'Ribeirão Preto', slug: 'fmrp', primaryColor: '#4c1d95', secondaryColor: '#e9d5ff', flagPattern: 'chevron' },
];

async function main() {
  let sports = 0;
  for (const [i, s] of SPORTS_CATALOG.entries()) {
    const exists = await prisma.sport.findUnique({ where: { slug: s.slug } });
    if (exists) continue;
    await prisma.sport.create({ data: { name: s.name, slug: s.slug, icon: s.icon, category: s.category, genders: s.genders.join(','), engine: s.config.engine, config: JSON.stringify(s.config), order: i } });
    sports++;
  }

  const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (!admins) {
    const email = (process.env.ADMIN_EMAIL ?? 'admin@arquibancada.app').toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? 'arquibancada123';
    await prisma.user.create({ data: { name: process.env.ADMIN_NAME ?? 'Admin', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) } });
    console.log(`👤 admin criado: ${email} / ${password}  (troque a senha no painel)`);
  }

  if (process.env.NODE_ENV !== 'production') {
    const email = 'mesario@arquibancada.app';
    if (!(await prisma.user.findUnique({ where: { email } }))) {
      const all = await prisma.sport.findMany({ select: { id: true } });
      await prisma.user.create({ data: { name: 'Mesário Demo', email, role: 'MESARIO', passwordHash: await bcrypt.hash('mesario123', 10), sports: { create: all.map((s) => ({ sportId: s.id })) } } });
      console.log(`📝 mesário demo: ${email} / mesario123`);
    }
  }

  let insts = 0;
  if (!(await prisma.institution.count({ where: { isSandbox: false } }))) {
    for (const i of INSTITUTIONS) {
      await prisma.institution.create({ data: i });
      insts++;
    }
  }

  if (!(await prisma.tournament.count({ where: { isSandbox: false } }))) {
    const t = await prisma.tournament.create({
      data: { name: 'TUSCA', edition: '2026', slug: 'tusca-2026', city: 'São Carlos', startsAt: new Date('2026-10-29T12:00:00-03:00'), endsAt: new Date('2026-11-01T22:00:00-03:00'), color: '#dc2626' },
    });
    await prisma.scoringRule.create({ data: { tournamentId: t.id, placementPoints: '[13,10,8,6,4,2,1]', racePoints: '[9,7,6,5,4,3,2,1]' } });
    console.log('🏆 torneio TUSCA 2026 criado');
  }

  console.log(`✅ seed ok (${sports} modalidades novas, ${insts} atléticas novas)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
