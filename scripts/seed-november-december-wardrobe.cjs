const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });

const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();

async function upsertItem(id, name, category, gender, colorName, colorCode, desc) {
  const item = await prisma.wardrobeItem.upsert({
    where: { id },
    create: {
      id,
      name,
      category,
      gender,
      description: desc || name,
      active: true,
    },
    update: {
      name,
      category,
      gender,
      description: desc || name,
    },
  });

  const variantId = `${id}-var-main`;
  const variant = await prisma.wardrobeItemVariant.upsert({
    where: { id: variantId },
    create: {
      id: variantId,
      itemId: item.id,
      colorName,
      colorCode,
    },
    update: {
      colorName,
      colorCode,
    },
  });

  return { item, variant };
}

async function upsertOutfit(id, title, genderTarget, stylingNotes, itemConfigs, coverImageUrl) {
  const outfit = await prisma.wardrobeOutfit.upsert({
    where: { id },
    create: {
      id,
      title,
      genderTarget,
      description: stylingNotes,
      notes: stylingNotes,
      coverImageUrl,
      isTemplate: false,
      active: true,
    },
    update: {
      title,
      genderTarget,
      description: stylingNotes,
      notes: stylingNotes,
      coverImageUrl,
      active: true,
    },
  });

  await prisma.wardrobeOutfitItem.deleteMany({ where: { outfitId: outfit.id } });
  for (const cfg of itemConfigs) {
    await prisma.wardrobeOutfitItem.create({
      data: {
        outfitId: outfit.id,
        itemId: cfg.item.item.id,
        variantId: cfg.item.variant.id,
        layerOrder: cfg.layerOrder,
        required: true,
        notes: cfg.notes,
      },
    });
  }

  return outfit;
}

async function upsertSchedule(id, title, dateStr, outfitId, instructions) {
  const scheduledDate = new Date(`${dateStr}T08:00:00.000Z`);
  const endDate = new Date(`${dateStr}T13:00:00.000Z`);

  return prisma.wardrobeSchedule.upsert({
    where: { id },
    create: {
      id,
      title,
      scheduledDate,
      endDate,
      eventType: 'SUNDAY_SERVICE',
      status: 'PUBLISHED',
      instructions,
      outfitId,
    },
    update: {
      title,
      scheduledDate,
      endDate,
      eventType: 'SUNDAY_SERVICE',
      status: 'PUBLISHED',
      instructions,
      outfitId,
    },
  });
}

async function main() {
  console.log('--- Seeding November & December 2026 Wardrobe Roster ---');

  // Base items
  const blackShoes = await upsertItem('item-shoes-black', 'Black Formal Leather Shoes / Heels', 'SHOES', 'ALL', 'Midnight Black', '#111827', 'Polished black corporate shoes or heels');
  const whiteShirt = await upsertItem('item-shirt-white', 'Crisp White Long-Sleeve Shirt', 'SHIRT', 'ALL', 'Pure White', '#FFFFFF', 'Classic formal white button-up shirt');
  const floralTie = await upsertItem('item-tie-floral', 'Floral / Light Coloured Tie', 'TIE', 'MALE', 'Floral Light Multi', '#EC4899', 'Light coloured floral necktie');
  const blackTrousers = await upsertItem('item-trousers-black', 'Black Pant Trouser', 'TROUSERS', 'ALL', 'Midnight Black', '#111827', 'Formal black tailored trousers');
  const whiteCamisole = await upsertItem('item-camisole-white', 'White Camisole Top', 'CAMISOLE', 'FEMALE', 'Pure White', '#FFFFFF', 'Modest inner white camisole top');
  const brightBlazer = await upsertItem('item-blazer-bright', 'Bright Coloured Blazer Jacket', 'BLAZER', 'ALL', 'Bright Yellow/Orange/Pink', '#F59E0B', 'Any vibrant, bright-coloured tailored blazer jacket');
  const nativeWear = await upsertItem('item-native-traditional', 'Traditional Native Attire', 'NATIVE_WEAR', 'ALL', 'Traditional Pattern', '#D97706', 'Modest, regal traditional African attire (Agbada/Kaftan/Ankara/Lace)');
  const conf2025Outfit = await upsertItem('item-conf-2025-outfit', '2025 Conference Outfit', 'SUIT', 'ALL', '2025 Special Blue', '#2563EB', 'Official 2025 Conference Uniform ensemble');

  // ==========================================
  // NOVEMBER 2026 ITEMS
  // ==========================================
  console.log('Upserting November items...');
  const wrapperBuba = await upsertItem('item-wrapper-buba', 'Wrapper and Buba / Aso Oke', 'NATIVE_WEAR', 'FEMALE', 'Aso Oke & Native Pattern', '#9333EA', 'Traditional Nigerian wrapper and buba native attire for ladies');
  const geleAsoOke = await upsertItem('item-gele-asooke', 'Aso Oke / Gele Head Tie', 'HEAD_TIE_GELE', 'FEMALE', 'Traditional Gold / Multi', '#D97706', 'Traditional Aso Oke head tie or gele for ladies');
  const agbadaBubaTrouser = await upsertItem('item-agbada-buba-trouser', 'Agbada / Buba / Trouser Ensemble', 'AGBADA', 'MALE', 'Traditional Regal Pattern', '#1E3A8A', 'Complete traditional regal Agbada, Buba and Trouser native attire for men');

  const blueJeanTrousers = await upsertItem('item-trousers-bluejean', 'Blue Jean Denim Trouser', 'TROUSERS', 'ALL', 'Denim Blue', '#2563EB', 'Classic blue denim jean pant trousers for all members');
  const jeanJacket = await upsertItem('item-jacket-jean', 'Blue Denim Jean Jacket', 'BLAZER', 'ALL', 'Denim Blue', '#1D4ED8', 'Tailored blue jean denim jacket for all members');

  const blueDress = await upsertItem('item-dress-blue', 'Blue Corporate Dress / Gown', 'GOWN', 'FEMALE', 'Royal Blue', '#1E40AF', 'Tailored modest blue corporate dress/gown for ladies');
  const floralScarf = await upsertItem('item-scarf-floral', 'Floral Scarf', 'SCARF', 'FEMALE', 'Floral Multi-Pattern', '#EC4899', 'Decorative floral scarf styled on the neckline for ladies');
  const blueSuit = await upsertItem('item-suit-blue', 'Blue Corporate Suit', 'SUIT', 'MALE', 'Royal Blue', '#1E40AF', 'Tailored classic 2-piece blue corporate suit for men');

  const combatPantAdire = await upsertItem('item-combat-pant-adire', 'Adire / Aso Oke / Ankara Combat Pant Trouser', 'TROUSERS', 'ALL', 'Adire / Ankara / Aso Oke Multi', '#4F46E5', 'Contemporary tailored combat pant trousers in Adire, Aso Oke or Ankara for all members');
  const blackTop = await upsertItem('item-top-black', 'Black Top / Shirt', 'SHIRT', 'ALL', 'Midnight Black', '#111827', 'Fitted smart black top or button-up shirt for all members');
  const blackBoots = await upsertItem('item-shoes-boot', 'Black Boots', 'SHOES', 'ALL', 'Midnight Black', '#111827', 'Smart black boots or high leather boots for all members');

  // ==========================================
  // NOVEMBER 2026 SCHEDULES
  // ==========================================
  console.log('Seeding Nov 1...');
  const outfitNov01 = await upsertOutfit(
    'outfit-nov-01',
    'Ladies: Wrapper & Buba / Gele | Men: Agbada / Buba / Trouser',
    'ALL',
    '• Sisters/Ladies: Wrapper and Buba / Aso Oke, Gele.\n• Brothers/Men: Agbada / Buba / Trouser.',
    [
      { item: wrapperBuba, layerOrder: 1, notes: 'Ladies: Wrapper and Buba' },
      { item: geleAsoOke, layerOrder: 2, notes: 'Ladies: Aso Oke, Gele' },
      { item: agbadaBubaTrouser, layerOrder: 3, notes: 'Men: Agbada / Buba / Trouser' },
      { item: blackShoes, layerOrder: 4, notes: 'All: Formal / traditional footwear' },
    ],
    '/wardrobe/native-all.jpg',
  );
  await upsertSchedule(
    'sched-nov-01',
    'Sunday 1st November: Wrapper & Buba / Gele & Agbada / Trouser',
    '2026-11-01',
    outfitNov01.id,
    'Ladies: Wrapper and Buba / Aso Oke, Gele. Men: Agbada / Buba / Trouser',
  );

  console.log('Seeding Nov 8...');
  const outfitNov08 = await upsertOutfit(
    'outfit-nov-08',
    'Blue Jean Trouser, White Shirt with Jean Jacket (For All)',
    'ALL',
    '• All Members (Brothers & Sisters): Blue Jean Trouser, White Shirt with Jean Jacket for all.',
    [
      { item: blueJeanTrousers, layerOrder: 1, notes: 'All: Blue jean trousers' },
      { item: whiteShirt, layerOrder: 2, notes: 'All: Crisp white shirt' },
      { item: jeanJacket, layerOrder: 3, notes: 'All: Jean jacket' },
      { item: blackShoes, layerOrder: 4, notes: 'All: Smart footwear / sneakers' },
    ],
    '/wardrobe/denim-jacket-jeans.jpg',
  );
  await upsertSchedule(
    'sched-nov-08',
    'Sunday 8th November: Blue Jean, White Shirt & Jean Jacket',
    '2026-11-08',
    outfitNov08.id,
    'Blue Jean Trouser, White Shirt with Jean Jacket for all',
  );

  console.log('Seeding Nov 15...');
  const outfitNov15 = await upsertOutfit(
    'outfit-nov-15',
    'Ladies: Blue Dress & Floral Scarf | Men: Blue Suit, White Shirt & Floral Tie',
    'ALL',
    '• Sisters/Ladies: Blue Dress with Floral Scarf.\n• Brothers/Men: Blue Suit / White Shirt / Floral Tie.',
    [
      { item: blueDress, layerOrder: 1, notes: 'Ladies: Blue corporate dress' },
      { item: floralScarf, layerOrder: 2, notes: 'Ladies: Floral scarf on the neck' },
      { item: blueSuit, layerOrder: 3, notes: 'Men: Blue corporate suit' },
      { item: whiteShirt, layerOrder: 4, notes: 'Men: White button-up shirt' },
      { item: floralTie, layerOrder: 5, notes: 'Men: Floral necktie' },
      { item: blackShoes, layerOrder: 6, notes: 'All: Formal black shoes / heels' },
    ],
    '/wardrobe/blue-dress-suit-floral.jpg',
  );
  await upsertSchedule(
    'sched-nov-15',
    'Sunday 15th November: Blue Dress + Floral Scarf & Blue Suit + Floral Tie',
    '2026-11-15',
    outfitNov15.id,
    'Ladies: Blue Dress with Floral Scarf. Men: Blue Suit / White Shirt / Floral Tie',
  );

  console.log('Seeding Nov 22...');
  const outfitNov22 = await upsertOutfit(
    'outfit-nov-22',
    '2025 Conference Outfit (For All)',
    'ALL',
    '• All Members (Brothers & Sisters): 2025 Conference outfit for all.',
    [
      { item: conf2025Outfit, layerOrder: 1, notes: 'All: Official 2025 Conference uniform outfit' },
      { item: blackShoes, layerOrder: 2, notes: 'All: Formal shoes / heels' },
    ],
    '/wardrobe/conference-2025.jpg',
  );
  await upsertSchedule(
    'sched-nov-22',
    'Sunday 22nd November: 2025 Conference Outfit for All',
    '2026-11-22',
    outfitNov22.id,
    '2025 Conference outfit for all',
  );

  console.log('Seeding Nov 29...');
  const outfitNov29 = await upsertOutfit(
    'outfit-nov-29',
    'Combat Pant Trouser, Black Top & Boot (For All)',
    'ALL',
    '• All Members (Brothers & Sisters): Adire / Aso Oke / Ankara Combat Pant Trouser / Black Top and Boot for all.',
    [
      { item: combatPantAdire, layerOrder: 1, notes: 'All: Adire / Aso Oke / Ankara combat pant trousers' },
      { item: blackTop, layerOrder: 2, notes: 'All: Black top / shirt' },
      { item: blackBoots, layerOrder: 3, notes: 'All: Black boots' },
    ],
    '/wardrobe/adire-combat-pants-boots.jpg',
  );
  await upsertSchedule(
    'sched-nov-29',
    'Sunday 29th November: Combat Pant Trouser, Black Top & Boot',
    '2026-11-29',
    outfitNov29.id,
    'Adire / Aso Oke / Ankara Combat Pant Trouser / Black Top and Boot for all.',
  );

  // ==========================================
  // DECEMBER 2026 ITEMS & SCHEDULES
  // ==========================================
  console.log('Upserting December items...');
  const colourRiotNative = await upsertItem('item-native-colour-riot', 'Colour Riot Traditional Native Attire', 'NATIVE_WEAR', 'ALL', 'Colour Riot Multi', '#A855F7', 'Vibrant multi-colored traditional African native attire (Colour Riot) for all members');
  const blazerJacketMen = await upsertItem('item-blazer-jacket-men', 'Blazer Jacket', 'BLAZER', 'MALE', 'Classic Navy / Dark Blazer', '#1E293B', 'Tailored corporate blazer jacket for men');

  console.log('Seeding Dec 6...');
  const outfitDec06 = await upsertOutfit(
    'outfit-dec-06',
    'Colour Riot Native (For All)',
    'ALL',
    '• All Members (Brothers & Sisters): Colour Riot Native for all. Vibrant celebration attire.',
    [
      { item: colourRiotNative, layerOrder: 1, notes: 'All: Colour Riot native wear' },
      { item: blackShoes, layerOrder: 2, notes: 'All: Traditional / formal footwear' },
    ],
    '/wardrobe/colour-riot-native.jpg',
  );
  await upsertSchedule(
    'sched-dec-06',
    'Sunday 6th December: Colour Riot Native for All',
    '2026-12-06',
    outfitDec06.id,
    'Colour Riot Native for all.',
  );

  console.log('Seeding Dec 13...');
  const outfitDec13 = await upsertOutfit(
    'outfit-dec-13',
    'Ladies: Bright Blazer & Black Pant | Men: Black Pant, White Shirt & Blazer',
    'ALL',
    '• Sisters/Ladies: Black Pant Trouser, White Camisole with any Bright Coloured Blazer.\n• Brothers/Men: Black Pant, White Shirt, Blazer Jacket.',
    [
      { item: blackTrousers, layerOrder: 1, notes: 'All: Black pant trousers' },
      { item: whiteCamisole, layerOrder: 2, notes: 'Ladies: White camisole top' },
      { item: brightBlazer, layerOrder: 3, notes: 'Ladies: Any bright-coloured blazer' },
      { item: whiteShirt, layerOrder: 4, notes: 'Men: Crisp white shirt' },
      { item: blazerJacketMen, layerOrder: 5, notes: 'Men: Blazer jacket' },
      { item: blackShoes, layerOrder: 6, notes: 'All: Black formal shoes / heels' },
    ],
    '/wardrobe/bright-blazer.jpg',
  );
  await upsertSchedule(
    'sched-dec-13',
    'Sunday 13th December: Bright Blazer & Black Pant Trousers',
    '2026-12-13',
    outfitDec13.id,
    'Ladies: Black Pant Trouser, White Camisole with any Bright Coloured Blazer. Men: Black Pant, White Shirt, Blazer Jacket',
  );

  console.log('Seeding Dec 20...');
  const outfitDec20 = await upsertOutfit(
    'outfit-dec-20',
    'Traditional Native Attire (Native for All)',
    'ALL',
    '• All Members (Brothers & Sisters): Native for all. Traditional Nigerian attire (Agbada / Kaftan / Senator / Ankara / Lace / Gele).',
    [
      { item: nativeWear, layerOrder: 1, notes: 'All: Traditional native wear (Agbada / Kaftan / Ankara / Lace)' },
    ],
    '/wardrobe/native-emerald-gold.jpg',
  );
  await upsertSchedule(
    'sched-dec-20',
    'Sunday 20th December: Native for All',
    '2026-12-20',
    outfitDec20.id,
    'Native for all.',
  );

  console.log('Seeding Dec 27...');
  const outfitDec27 = await upsertOutfit(
    'outfit-dec-27',
    'Traditional Native Attire (Native for All)',
    'ALL',
    '• All Members (Brothers & Sisters): Native for all. Traditional Nigerian attire (Agbada / Kaftan / Senator / Ankara / Lace / Gele).',
    [
      { item: nativeWear, layerOrder: 1, notes: 'All: Traditional native wear (Agbada / Kaftan / Ankara / Lace)' },
    ],
    '/wardrobe/native-champagne-gold.jpg',
  );
  await upsertSchedule(
    'sched-dec-27',
    'Sunday 27th December: Native for All',
    '2026-12-27',
    outfitDec27.id,
    'Native for all.',
  );

  console.log('🎉 Successfully seeded all November and December 2026 schedules!');
  const total = await prisma.wardrobeSchedule.count();
  console.log(`Total schedules in database now: ${total}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

