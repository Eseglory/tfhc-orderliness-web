import { PrismaClient } from '@prisma/client';

export async function seedWardrobeSeptemberRoster(prisma: PrismaClient) {
  console.log('--- Seeding Complete July, August, September Uniform Roster (High Fidelity) ---');

  // 1. Categories
  const categories = [
    { key: 'SUIT', name: 'Suit & Blazers', icon: 'checkroom', sortOrder: 1 },
    { key: 'BLAZER', name: 'Blazer', icon: 'dry_cleaning', sortOrder: 2 },
    { key: 'SHIRT', name: 'Shirt & Tops', icon: 'apparel', sortOrder: 3 },
    { key: 'CAMISOLE', name: 'Camisole', icon: 'styler', sortOrder: 4 },
    { key: 'TROUSERS', name: 'Trousers & Pants', icon: 'straighten', sortOrder: 5 },
    { key: 'SKIRT', name: 'Skirt', icon: 'woman', sortOrder: 6 },
    { key: 'GOWN', name: 'Gown / Dress', icon: 'styler', sortOrder: 7 },
    { key: 'NATIVE_WEAR', name: 'Native / Traditional', icon: 'workspace_premium', sortOrder: 8 },
    { key: 'AGBADA', name: 'Agbada / Kaftan', icon: 'military_tech', sortOrder: 9 },
    { key: 'TIE', name: 'Tie & Bowtie', icon: 'loyalty', sortOrder: 10 },
    { key: 'SCARF', name: 'Neckline Scarf', icon: 'waves', sortOrder: 11 },
    { key: 'HEAD_TIE_GELE', name: 'Head Tie / Gele / Cap', icon: 'filter_vintage', sortOrder: 12 },
    { key: 'BERET', name: 'Beret', icon: 'face', sortOrder: 13 },
    { key: 'SUSPENDERS', name: 'Suspenders / Braces', icon: 'unfold_more', sortOrder: 14 },
    { key: 'SHOES', name: 'Footwear & Shoes', icon: 'roller_skating', sortOrder: 15 },
    { key: 'ACCESSORIES', name: 'Accessories', icon: 'diamond', sortOrder: 16 },
  ];

  for (const cat of categories) {
    await prisma.wardrobeCategory.upsert({
      where: { key: cat.key },
      create: { ...cat, isSystem: true, active: true },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
    });
  }

  // 2. Colors
  const colors = [
    { key: 'WHITE', name: 'Pure White', hexCode: '#FFFFFF', sortOrder: 1 },
    { key: 'BLACK', name: 'Midnight Black', hexCode: '#111827', sortOrder: 2 },
    { key: 'RED', name: 'Crimson Red', hexCode: '#DC2626', sortOrder: 3 },
    { key: 'LEMON', name: 'Lemon Lime (2024 Conf)', hexCode: '#84CC16', sortOrder: 4 },
    { key: 'GREEN', name: 'Emerald Green', hexCode: '#10B981', sortOrder: 5 },
    { key: 'CARTON', name: 'Carton / Tan / Beige', hexCode: '#D97706', sortOrder: 6 },
    { key: 'SKY_BLUE', name: 'Sky Blue', hexCode: '#38BDF8', sortOrder: 7 },
    { key: 'NAVY_BLUE', name: 'Navy Blue', hexCode: '#1E3A8A', sortOrder: 8 },
    { key: 'GREY', name: 'Classic Grey', hexCode: '#6B7280', sortOrder: 9 },
    { key: 'FLORAL', name: 'Floral Multi-Pattern', hexCode: '#EC4899', sortOrder: 10 },
    { key: 'BRIGHT_ORANGE', name: 'Bright Orange / Multi', hexCode: '#F97316', sortOrder: 11 },
    { key: 'COLOUR_RIOT', name: 'Colour Riot Multi-Color', hexCode: '#A855F7', sortOrder: 12 },
    { key: 'CONF_2025_BLUE', name: '2025 Conference Blue', hexCode: '#2563EB', sortOrder: 13 },
  ];

  for (const col of colors) {
    await prisma.wardrobeColor.upsert({
      where: { key: col.key },
      create: { ...col },
      update: { name: col.name, hexCode: col.hexCode, sortOrder: col.sortOrder },
    });
  }

  // 3. Upsert Catalogue Item & Variant
  async function upsertItem(
    id: string,
    name: string,
    category: string,
    gender: 'ALL' | 'MALE' | 'FEMALE',
    colorName: string,
    colorCode: string,
    desc?: string,
  ) {
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

  // Catalogue Item Declarations
  const cartonTrousers = await upsertItem('item-trousers-carton', 'Carton-Colour Pant Trouser', 'TROUSERS', 'ALL', 'Carton / Tan', '#D97706', 'Formal carton-colour tailored pant trouser');
  const blackTrousers = await upsertItem('item-trousers-black', 'Black Pant Trouser', 'TROUSERS', 'ALL', 'Midnight Black', '#111827', 'Formal black tailored trousers');
  const greyTrousers = await upsertItem('item-trousers-grey', 'Grey Pant Trouser', 'TROUSERS', 'MALE', 'Classic Grey', '#6B7280', 'Smart grey tailored formal trousers');
  
  const whiteShirt = await upsertItem('item-shirt-white', 'Crisp White Long-Sleeve Shirt', 'SHIRT', 'ALL', 'Pure White', '#FFFFFF', 'Classic formal white button-up shirt');
  const blackShirt = await upsertItem('item-shirt-black', 'Black Formal Shirt', 'SHIRT', 'MALE', 'Midnight Black', '#111827', 'Smart formal black button-up shirt');
  const skyBlueShirt = await upsertItem('item-shirt-skyblue', 'Sky Blue Formal Shirt', 'SHIRT', 'MALE', 'Sky Blue', '#38BDF8', 'Sky blue buttoned dress shirt');
  const checkShirt = await upsertItem('item-shirt-check', 'Check Pattern Shirt', 'SHIRT', 'MALE', 'Check Multi-Pattern', '#3B82F6', 'Checkered formal button-down shirt');
  const brightShirt = await upsertItem('item-shirt-bright', 'Bright Coloured Shirt', 'SHIRT', 'MALE', 'Bright Multi-Colour', '#F97316', 'Vibrant bright coloured shirt');
  const whiteCamisole = await upsertItem('item-camisole-white', 'White Camisole Top', 'CAMISOLE', 'FEMALE', 'Pure White', '#FFFFFF', 'Modest inner white camisole top');

  const redTie = await upsertItem('item-tie-red', 'Red Necktie', 'TIE', 'ALL', 'Crimson Red', '#DC2626', 'Smart red necktie');
  const blackTie = await upsertItem('item-tie-black', 'Black Necktie', 'TIE', 'ALL', 'Midnight Black', '#111827', 'Formal black necktie');
  const greenTie = await upsertItem('item-tie-green', 'Green Necktie', 'TIE', 'MALE', 'Emerald Green', '#10B981', 'Green necktie for suit pairing');
  const floralTie = await upsertItem('item-tie-floral', 'Floral / Light Coloured Tie', 'TIE', 'MALE', 'Floral Light Multi', '#EC4899', 'Light coloured floral necktie');

  const brightBlazer = await upsertItem('item-blazer-bright', 'Bright Coloured Blazer Jacket', 'BLAZER', 'ALL', 'Bright Yellow/Orange/Pink', '#F59E0B', 'Any vibrant, bright-coloured tailored blazer jacket');
  const greenSuit = await upsertItem('item-suit-green', 'Green Corporate Suit', 'SUIT', 'MALE', 'Emerald Green', '#10B981', 'Tailored green 2-piece corporate suit');
  const blackSuit = await upsertItem('item-suit-black', 'Black Corporate Suit', 'SUIT', 'MALE', 'Midnight Black', '#111827', 'Tailored black 2-piece corporate suit');
  const navySuit = await upsertItem('item-suit-navy', 'Navy Blue Suit', 'SUIT', 'MALE', 'Navy Blue', '#1E3A8A', 'Tailored navy blue 2-piece suit');

  const suspenders = await upsertItem('item-suspenders-black', 'Black Suspenders / Braces', 'SUSPENDERS', 'ALL', 'Midnight Black', '#111827', 'Formal black clip-on or button suspenders');
  const lemonGown = await upsertItem('item-gown-lemon', 'Lemon Gown (2024 Conference Uniform)', 'GOWN', 'FEMALE', 'Lemon / Lime', '#84CC16', '2024 conference uniform lemon yellow/green gown');
  const blackGown = await upsertItem('item-gown-black', 'Black Corporate Gown', 'GOWN', 'FEMALE', 'Midnight Black', '#111827', 'Elegant corporate black dress/gown');
  const redGown = await upsertItem('item-gown-red', 'Red Corporate Gown', 'GOWN', 'FEMALE', 'Crimson Red', '#DC2626', 'Modest corporate red dress/gown');
  const colourRiotGown = await upsertItem('item-gown-colour-riot', 'Colour Riot Corporate Gown', 'GOWN', 'FEMALE', 'Colour Riot Multi', '#EC4899', 'Vibrant, colorful corporate gown (Colour Riot)');
  const colourRiotPantSuit = await upsertItem('item-suit-colour-riot', 'Colour Riot Pant Trouser Suit', 'SUIT', 'FEMALE', 'Colour Riot Multi', '#8B5CF6', 'Tailored colour riot matching pant trouser suit');

  const necklineScarf = await upsertItem('item-scarf-neckline', 'Neckline Scarf', 'SCARF', 'FEMALE', 'Patterned / Silk', '#F59E0B', 'Decorative scarf styled gracefully on the neckline');
  const blackBeret = await upsertItem('item-beret-black', 'Black Beret Headwear', 'BERET', 'FEMALE', 'Midnight Black', '#111827', 'Classic black orderliness beret');
  const nativeWear = await upsertItem('item-native-traditional', 'Traditional Native Attire', 'NATIVE_WEAR', 'ALL', 'Traditional Pattern', '#D97706', 'Modest, regal traditional African attire (Agbada/Kaftan/Ankara/Lace)');
  const whiteNativeWear = await upsertItem('item-native-white', 'All-White Traditional Native Attire', 'NATIVE_WEAR', 'ALL', 'Pure White', '#FFFFFF', 'All-white traditional native attire for all members');
  const conf2025Outfit = await upsertItem('item-conf-2025-outfit', '2025 Conference Outfit', 'SUIT', 'MALE', '2025 Special Blue', '#2563EB', 'Official 2025 Conference Uniform ensemble');

  const whiteShoes = await upsertItem('item-shoes-white', 'White Formal Shoes / Heels', 'SHOES', 'ALL', 'Pure White', '#FFFFFF', 'Clean white formal shoes, flats, or heels');
  const blackShoes = await upsertItem('item-shoes-black', 'Black Formal Leather Shoes / Heels', 'SHOES', 'ALL', 'Midnight Black', '#111827', 'Polished black corporate shoes or heels');

  // 4. Upsert Outfit Helper
  async function upsertOutfit(
    id: string,
    title: string,
    genderTarget: 'ALL' | 'BROTHERS' | 'SISTERS',
    stylingNotes: string,
    itemConfigs: Array<{ item: { item: any; variant: any }; layerOrder: number; notes?: string }>,
    coverImageUrl?: string,
  ) {
    const outfit = await prisma.wardrobeOutfit.upsert({
      where: { id },
      create: {
        id,
        title,
        genderTarget,
        description: stylingNotes,
        notes: stylingNotes,
        coverImageUrl: coverImageUrl || null,
        isTemplate: false,
        active: true,
      },
      update: {
        title,
        genderTarget,
        description: stylingNotes,
        notes: stylingNotes,
        coverImageUrl: coverImageUrl || null,
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

  // 5. Upsert Schedule Helper
  async function upsertSchedule(
    id: string,
    title: string,
    dateStr: string,
    outfitId: string,
    instructions: string,
  ) {
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

  // =========================================================================
  // JULY 2026 UNIFORM ROSTER
  // =========================================================================
  const outfitJuly05 = await upsertOutfit(
    'outfit-july-05',
    'Ladies: Lemon Gown (2024 Conf.) | Men: Green/Black Suit',
    'ALL',
    '• Sisters/Ladies: Lemon gown (2024 conference uniform) with white shoes.\n• Brothers/Men: Green Suit, White Shirt and Black Tie (or Black Suit, White Shirt & Green Tie).',
    [
      { item: lemonGown, layerOrder: 1, notes: 'Ladies: Lemon gown (2024 conference uniform)' },
      { item: whiteShoes, layerOrder: 2, notes: 'Ladies: White shoes / heels' },
      { item: greenSuit, layerOrder: 3, notes: 'Men: Green Suit (or Black Suit)' },
      { item: whiteShirt, layerOrder: 4, notes: 'Men: Crisp White Shirt' },
      { item: blackTie, layerOrder: 5, notes: 'Men: Black Tie (Green Tie if wearing Black Suit)' },
    ],
    '/wardrobe/lemon-gown.jpg',
  );
  await upsertSchedule(
    'sched-july-05',
    'Sunday 5th July: Lemon Gown & Green/Black Suit',
    '2026-07-05',
    outfitJuly05.id,
    'Ladies: Lemon gown (2024 conference uniform) with white shoe. Men: Green Suit, White Shirt and Black Tie (or Black Suit, White Shirt & Green Tie).',
  );

  const outfitJuly12 = await upsertOutfit(
    'outfit-july-12',
    'Ladies: Black Gown & Neckline Scarf | Men: All-Black & Floral Tie',
    'ALL',
    '• Sisters/Ladies: Black gown with decorative scarf on the neckline.\n• Brothers/Men: Black pant trouser, Black shirt and Floral tie (light coloured).',
    [
      { item: blackGown, layerOrder: 1, notes: 'Ladies: Black corporate gown' },
      { item: necklineScarf, layerOrder: 2, notes: 'Ladies: Scarf on the neckline' },
      { item: blackTrousers, layerOrder: 3, notes: 'Men: Black pant trousers' },
      { item: blackShirt, layerOrder: 4, notes: 'Men: Black button-up shirt' },
      { item: floralTie, layerOrder: 5, notes: 'Men: Light-coloured floral tie' },
    ],
  );
  await upsertSchedule(
    'sched-july-12',
    'Sunday 12th July: Black Gown + Scarf & All-Black with Floral Tie',
    '2026-07-12',
    outfitJuly12.id,
    'Ladies: Black gown with scarf on the neckline. Men: Black pant trouser, Black shirt & floral tie (light coloured).',
  );

  const outfitJuly19 = await upsertOutfit(
    'outfit-july-19',
    'Traditional Native Attire (For All)',
    'ALL',
    '• All Members: Traditional Native wear for all. Regal, modest African traditional ensemble (Agbada / Kaftan / Ankara / Lace / Gele).',
    [
      { item: nativeWear, layerOrder: 1, notes: 'Traditional Native attire for all members' },
    ],
    '/wardrobe/native-all.jpg',
  );
  await upsertSchedule(
    'sched-july-19',
    'Sunday 19th July: Native for All',
    '2026-07-19',
    outfitJuly19.id,
    'Native for all members.',
  );

  const outfitJuly26 = await upsertOutfit(
    'outfit-july-26',
    'Ladies: Red Gown & Black Beret | Men: Black Suit & Check Shirt',
    'ALL',
    '• Sisters/Ladies: Red gown with classic black beret.\n• Brothers/Men: Black corporate suit with check pattern shirt.',
    [
      { item: redGown, layerOrder: 1, notes: 'Ladies: Red corporate gown' },
      { item: blackBeret, layerOrder: 2, notes: 'Ladies: Black beret headwear' },
      { item: blackSuit, layerOrder: 3, notes: 'Men: Black corporate suit' },
      { item: checkShirt, layerOrder: 4, notes: 'Men: Check shirt' },
    ],
  );
  await upsertSchedule(
    'sched-july-26',
    'Sunday 26th July: Red Gown + Black Beret & Black Suit + Check Shirt',
    '2026-07-26',
    outfitJuly26.id,
    'Ladies: Red gown with black beret. Men: Black Suit, Check Shirt.',
  );

  // =========================================================================
  // AUGUST 2026 UNIFORM ROSTER
  // =========================================================================
  const outfitAug02 = await upsertOutfit(
    'outfit-aug-02',
    'White Native Attire (For All)',
    'ALL',
    '• All Members: Pure white traditional native wear for all members.',
    [
      { item: whiteNativeWear, layerOrder: 1, notes: 'All-white traditional native wear' },
    ],
    '/wardrobe/white-native.jpg',
  );
  await upsertSchedule(
    'sched-aug-02',
    'Sunday 2nd August: White Native for All',
    '2026-08-02',
    outfitAug02.id,
    'White native for all.',
  );

  const outfitAug09 = await upsertOutfit(
    'outfit-aug-09',
    'Black Trousers, White Shirt & Suspenders (For All)',
    'ALL',
    '• All Members: Black pant trouser, white crisp long-sleeve shirt and black suspenders/braces for all.',
    [
      { item: blackTrousers, layerOrder: 1, notes: 'Black pant trousers' },
      { item: whiteShirt, layerOrder: 2, notes: 'Crisp white shirt' },
      { item: suspenders, layerOrder: 3, notes: 'Black suspenders / braces' },
    ],
    '/wardrobe/black-suspenders.jpg',
  );
  await upsertSchedule(
    'sched-aug-09',
    'Sunday 9th August: Black Trousers, White Shirt & Suspenders',
    '2026-08-09',
    outfitAug09.id,
    'Black pant trouser, white shirt and suspenders (for all).',
  );

  const outfitAug16 = await upsertOutfit(
    'outfit-aug-16',
    'Traditional Native Attire (For All)',
    'ALL',
    '• All Members: Traditional native wear for all members.',
    [
      { item: nativeWear, layerOrder: 1, notes: 'Traditional native attire' },
    ],
    '/wardrobe/native-all.jpg',
  );
  await upsertSchedule(
    'sched-aug-16',
    'Sunday 16th August: Native for All',
    '2026-08-16',
    outfitAug16.id,
    'Native for all.',
  );

  const outfitAug23 = await upsertOutfit(
    'outfit-aug-23',
    'Ladies: Colour Riot Gown | Men: Grey Trousers, Sky Blue Shirt & Black Tie',
    'ALL',
    '• Sisters/Ladies: Colour Riot corporate gown.\n• Brothers/Men: Grey pant trouser, Sky blue shirt and Black tie.',
    [
      { item: colourRiotGown, layerOrder: 1, notes: 'Ladies: Colour Riot corporate gown' },
      { item: greyTrousers, layerOrder: 2, notes: 'Men: Grey pant trousers' },
      { item: skyBlueShirt, layerOrder: 3, notes: 'Men: Sky blue shirt' },
      { item: blackTie, layerOrder: 4, notes: 'Men: Black necktie' },
    ],
  );
  await upsertSchedule(
    'sched-aug-23',
    'Sunday 23rd August: Colour Riot Gown & Grey Trousers + Sky Blue Shirt',
    '2026-08-23',
    outfitAug23.id,
    'Ladies: Colour Riot corporate gown. Men: Grey Pant trouser, Sky Blue Shirt, Black Tie.',
  );

  const outfitAug30 = await upsertOutfit(
    'outfit-aug-30',
    'Ladies: Colour Riot Gown | Men: Navy Blue Suit & Bright Shirt',
    'ALL',
    '• Sisters/Ladies: Colour Riot corporate gown.\n• Brothers/Men: Navy Blue Suit, Bright Coloured Shirt and Black Shoes.',
    [
      { item: colourRiotGown, layerOrder: 1, notes: 'Ladies: Colour Riot corporate gown' },
      { item: navySuit, layerOrder: 2, notes: 'Men: Navy Blue Suit' },
      { item: brightShirt, layerOrder: 3, notes: 'Men: Bright Coloured Shirt' },
      { item: blackShoes, layerOrder: 4, notes: 'Men: Black formal shoes' },
    ],
  );
  await upsertSchedule(
    'sched-aug-30',
    'Sunday 30th August: Colour Riot Gown & Navy Blue Suit with Bright Shirt',
    '2026-08-30',
    outfitAug30.id,
    'Ladies: Colour Riot corporate gown. Men: Navy Blue Suit, Bright Coloured Shirt, Black Shoe.',
  );

  // =========================================================================
  // SEPTEMBER 2026 UNIFORM ROSTER (PRIMARY FOCUS)
  // =========================================================================
  const outfitSept06 = await upsertOutfit(
    'outfit-sept-06',
    'Carton-Colour Trousers, White Shirt & Red Tie (For All)',
    'ALL',
    '• All Members (Brothers & Sisters): Carton-colour pant trouser, white crisp shirt with red necktie.',
    [
      { item: cartonTrousers, layerOrder: 1, notes: 'All: Carton-colour pant trousers' },
      { item: whiteShirt, layerOrder: 2, notes: 'All: Crisp white shirt' },
      { item: redTie, layerOrder: 3, notes: 'All: Red necktie' },
      { item: blackShoes, layerOrder: 4, notes: 'All: Formal shoes' },
    ],
    '/wardrobe/carton-red-tie.jpg',
  );
  await upsertSchedule(
    'sched-sept-06',
    'Sunday 6th September: Carton Trousers, White Shirt & Red Tie',
    '2026-09-06',
    outfitSept06.id,
    'Carton-colour pant trouser, white shirt with red tie for all.',
  );

  const outfitSept13 = await upsertOutfit(
    'outfit-sept-13',
    'Ladies: Black Trousers, White Camisole & Bright Blazer | Men: Black Trousers, White Shirt & Blazer',
    'ALL',
    '• Sisters/Ladies: Black pant trouser, white camisole top with any bright-coloured blazer.\n• Brothers/Men: Black pant trouser, white shirt, blazer jacket.',
    [
      { item: blackTrousers, layerOrder: 1, notes: 'All: Black pant trousers' },
      { item: brightBlazer, layerOrder: 2, notes: 'Ladies: Bright-coloured blazer (Men: Blazer jacket)' },
      { item: whiteCamisole, layerOrder: 3, notes: 'Ladies: White camisole top' },
      { item: whiteShirt, layerOrder: 4, notes: 'Men: White shirt' },
      { item: blackShoes, layerOrder: 5, notes: 'All: Black shoes / heels' },
    ],
    '/wardrobe/bright-blazer.jpg',
  );
  await upsertSchedule(
    'sched-sept-13',
    'Sunday 13th September: Bright Blazer & Black Trousers',
    '2026-09-13',
    outfitSept13.id,
    'Ladies: Black pant trouser, white camisole with any bright-coloured blazer. Men: Black Pant trouser, White Shirt, Blazer Jacket.',
  );

  const outfitSept20 = await upsertOutfit(
    'outfit-sept-20',
    'Traditional Native Attire (Native for All)',
    'ALL',
    '• All Members (Brothers & Sisters): Native for all. Traditional Nigerian attire (Agbada / Kaftan / Senator / Ankara / Lace / Gele).',
    [
      { item: nativeWear, layerOrder: 1, notes: 'All: Traditional native wear (Agbada / Kaftan / Ankara / Lace)' },
    ],
    '/wardrobe/native-all.jpg',
  );
  await upsertSchedule(
    'sched-sept-20',
    'Sunday 20th September: Native for All',
    '2026-09-20',
    outfitSept20.id,
    'Native for all.',
  );

  const outfitSept27 = await upsertOutfit(
    'outfit-sept-27',
    'Ladies: Colour Riot Pant Suit | Men: 2025 Conference Outfit',
    'ALL',
    '• Sisters/Ladies: Colour Riot pant trouser suit.\n• Brothers/Men: 2025 Conference Outfit.',
    [
      { item: colourRiotPantSuit, layerOrder: 1, notes: 'Ladies: Colour Riot pant trouser suit' },
      { item: conf2025Outfit, layerOrder: 2, notes: 'Men: 2025 Conference Outfit' },
      { item: blackShoes, layerOrder: 3, notes: 'All: Formal shoes / heels' },
    ],
    '/wardrobe/colour-riot-suit.jpg',
  );
  await upsertSchedule(
    'sched-sept-27',
    'Sunday 27th September: Colour Riot Pant Suit & 2025 Conference Outfit',
    '2026-09-27',
    outfitSept27.id,
    'Ladies: Colour Riot pant trouser suit. Men: 2025 Conference Outfit.',
  );

  console.log('✅ High-Fidelity Uniform Roster Seeded');
}
