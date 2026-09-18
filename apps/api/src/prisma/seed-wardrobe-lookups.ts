import { PrismaClient } from '@prisma/client';

export const INITIAL_WARDROBE_CATEGORIES = [
  { key: 'SUIT', name: 'Suit', icon: '👔', description: 'Formal tailored suits', sortOrder: 10 },
  { key: 'BLAZER', name: 'Blazer', icon: '🧥', description: 'Smart casual and formal blazers', sortOrder: 20 },
  { key: 'SHIRT', name: 'Shirt', icon: '👔', description: 'Button-up formal & casual shirts', sortOrder: 30 },
  { key: 'TROUSERS', name: 'Trousers', icon: '👖', description: 'Formal trousers and pants', sortOrder: 40 },
  { key: 'SKIRT', name: 'Skirt', icon: '👗', description: 'Formal and modest skirts', sortOrder: 50 },
  { key: 'GOWN', name: 'Gown', icon: '👗', description: 'Formal dresses and gowns', sortOrder: 60 },
  { key: 'NATIVE_WEAR', name: 'Native Wear', icon: '👘', description: 'Traditional and native attire', sortOrder: 70 },
  { key: 'AGBADA', name: 'Agbada', icon: '👘', description: 'Traditional flowing wide-sleeved robe', sortOrder: 80 },
  { key: 'KAFTAN', name: 'Kaftan', icon: '👘', description: 'Tailored long kaftans', sortOrder: 90 },
  { key: 'SENATOR_WEAR', name: 'Senator Wear', icon: '👔', description: 'Modern Nigerian Senator style attire', sortOrder: 100 },
  { key: 'BUBA', name: 'Buba', icon: '👘', description: 'Traditional loose-fitting tunic/blouse', sortOrder: 110 },
  { key: 'IRO', name: 'Iro', icon: '👗', description: 'Traditional wrap-around skirt', sortOrder: 120 },
  { key: 'WRAPPER', name: 'Wrapper', icon: '👗', description: 'Traditional wrapper / double wrapper', sortOrder: 130 },
  { key: 'TIE', name: 'Tie', icon: '👔', description: 'Neckties', sortOrder: 140 },
  { key: 'BOW_TIE', name: 'Bow Tie', icon: '🎀', description: 'Formal bow ties', sortOrder: 150 },
  { key: 'SCARF', name: 'Scarf', icon: '🧣', description: 'Neck scarves, shawls, and stoles', sortOrder: 160 },
  { key: 'HEAD_TIE_GELE', name: 'Head Tie / Gele', icon: '👑', description: 'Traditional Nigerian head tie / Gele', sortOrder: 170 },
  { key: 'SHOES', name: 'Shoes', icon: '👞', description: 'Formal leather shoes, heels, and flats', sortOrder: 180 },
  { key: 'SANDALS', name: 'Sandals', icon: '👡', description: 'Formal and smart sandals', sortOrder: 190 },
  { key: 'CAP', name: 'Cap', icon: '🧢', description: 'Traditional caps (Fila / Abeti Aja / Hausa cap)', sortOrder: 200 },
  { key: 'HAT', name: 'Hat', icon: '🎩', description: 'Church hats and fascinators', sortOrder: 210 },
  { key: 'ACCESSORIES', name: 'Accessories', icon: '💍', description: 'Cufflinks, pocket squares, brooches, jewelry', sortOrder: 220 },
];

export const INITIAL_WARDROBE_COLORS = [
  { key: 'BLACK', name: 'Black', hexCode: '#000000', sortOrder: 10 },
  { key: 'WHITE', name: 'White', hexCode: '#FFFFFF', sortOrder: 20 },
  { key: 'NAVY_BLUE', name: 'Navy Blue', hexCode: '#0A192F', sortOrder: 30 },
  { key: 'ROYAL_BLUE', name: 'Royal Blue', hexCode: '#1D4ED8', sortOrder: 40 },
  { key: 'GREEN', name: 'Green', hexCode: '#15803D', sortOrder: 50 },
  { key: 'RED', name: 'Red', hexCode: '#DC2626', sortOrder: 60 },
  { key: 'BURGUNDY', name: 'Burgundy', hexCode: '#800020', sortOrder: 70 },
  { key: 'GREY', name: 'Grey', hexCode: '#6B7280', sortOrder: 80 },
  { key: 'BROWN', name: 'Brown', hexCode: '#78350F', sortOrder: 90 },
  { key: 'CREAM', name: 'Cream', hexCode: '#FFFDD0', sortOrder: 100 },
  { key: 'BEIGE', name: 'Beige', hexCode: '#F5F5DC', sortOrder: 110 },
  { key: 'GOLD', name: 'Gold', hexCode: '#D97706', sortOrder: 120 },
  { key: 'SILVER', name: 'Silver', hexCode: '#94A3B8', sortOrder: 130 },
  { key: 'PURPLE', name: 'Purple', hexCode: '#7E22CE', sortOrder: 140 },
  { key: 'PINK', name: 'Pink', hexCode: '#EC4899', sortOrder: 150 },
  { key: 'YELLOW', name: 'Yellow', hexCode: '#EAB308', sortOrder: 160 },
  { key: 'ORANGE', name: 'Orange', hexCode: '#EA580C', sortOrder: 170 },
];

/**
 * Idempotently seeds wardrobe clothing categories and color palettes.
 * Does NOT delete or overwrite custom categories or colors created by administrators.
 */
export async function seedWardrobeLookups(prisma: PrismaClient) {
  let categoriesCount = 0;
  for (const cat of INITIAL_WARDROBE_CATEGORIES) {
    await prisma.wardrobeCategory.upsert({
      where: { key: cat.key },
      update: {
        isSystem: true,
      },
      create: {
        key: cat.key,
        name: cat.name,
        icon: cat.icon,
        description: cat.description,
        sortOrder: cat.sortOrder,
        isSystem: true,
        active: true,
      },
    });
    categoriesCount++;
  }

  let colorsCount = 0;
  for (const col of INITIAL_WARDROBE_COLORS) {
    await prisma.wardrobeColor.upsert({
      where: { key: col.key },
      update: {
        isSystem: true,
      },
      create: {
        key: col.key,
        name: col.name,
        hexCode: col.hexCode,
        sortOrder: col.sortOrder,
        isSystem: true,
        active: true,
      },
    });
    colorsCount++;
  }

  return { categoriesCount, colorsCount };
}
