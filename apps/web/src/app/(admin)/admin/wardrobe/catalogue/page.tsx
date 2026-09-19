'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Shirt,
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Palette,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Upload,
  ArrowLeft,
  Search,
  Sparkles,
  Layers,
  Check,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { useAuth, canCreateWardrobe } from '@/lib/auth';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';

interface Variant {
  id: string;
  colorName: string;
  colorHex?: string;
  imageUrl?: string;
  isDefault: boolean;
}

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  gender: string;
  imageUrl?: string;
  isActive: boolean;
  notes?: string;
  variants: Variant[];
  _count?: {
    outfitItems: number;
  };
}

interface DynamicCategory {
  id: string;
  key: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder: number;
}

interface DynamicColor {
  id: string;
  key: string;
  name: string;
  hexCode: string;
  sortOrder: number;
}

const DEFAULT_CATEGORIES: DynamicCategory[] = [
  { id: '1', key: 'SUIT', name: 'Suit', icon: '👔', sortOrder: 10 },
  { id: '2', key: 'BLAZER', name: 'Blazer', icon: '🧥', sortOrder: 20 },
  { id: '3', key: 'SHIRT', name: 'Shirt', icon: '👔', sortOrder: 30 },
  { id: '4', key: 'TROUSERS', name: 'Trousers', icon: '👖', sortOrder: 40 },
  { id: '5', key: 'SKIRT', name: 'Skirt', icon: '👗', sortOrder: 50 },
  { id: '6', key: 'GOWN', name: 'Gown', icon: '👗', sortOrder: 60 },
  { id: '7', key: 'NATIVE_WEAR', name: 'Native Wear', icon: '👘', sortOrder: 70 },
  { id: '8', key: 'AGBADA', name: 'Agbada', icon: '👘', sortOrder: 80 },
  { id: '9', key: 'KAFTAN', name: 'Kaftan', icon: '👘', sortOrder: 90 },
  { id: '10', key: 'SENATOR_WEAR', name: 'Senator Wear', icon: '👔', sortOrder: 100 },
  { id: '11', key: 'BUBA', name: 'Buba', icon: '👘', sortOrder: 110 },
  { id: '12', key: 'IRO', name: 'Iro', icon: '👗', sortOrder: 120 },
  { id: '13', key: 'WRAPPER', name: 'Wrapper', icon: '👗', sortOrder: 130 },
  { id: '14', key: 'TIE', name: 'Tie', icon: '👔', sortOrder: 140 },
  { id: '15', key: 'BOW_TIE', name: 'Bow Tie', icon: '🎀', sortOrder: 150 },
  { id: '16', key: 'SCARF', name: 'Scarf', icon: '🧣', sortOrder: 160 },
  { id: '17', key: 'HEAD_TIE_GELE', name: 'Head Tie / Gele', icon: '👑', sortOrder: 170 },
  { id: '18', key: 'SHOES', name: 'Shoes', icon: '👞', sortOrder: 180 },
  { id: '19', key: 'SANDALS', name: 'Sandals', icon: '👡', sortOrder: 190 },
  { id: '20', key: 'CAP', name: 'Cap', icon: '🧢', sortOrder: 200 },
  { id: '21', key: 'HAT', name: 'Hat', icon: '🎩', sortOrder: 210 },
  { id: '22', key: 'ACCESSORIES', name: 'Accessories', icon: '💍', sortOrder: 220 },
];

const DEFAULT_COLORS: DynamicColor[] = [
  { id: '1', key: 'BLACK', name: 'Black', hexCode: '#000000', sortOrder: 10 },
  { id: '2', key: 'WHITE', name: 'White', hexCode: '#FFFFFF', sortOrder: 20 },
  { id: '3', key: 'NAVY_BLUE', name: 'Navy Blue', hexCode: '#0A192F', sortOrder: 30 },
  { id: '4', key: 'ROYAL_BLUE', name: 'Royal Blue', hexCode: '#1D4ED8', sortOrder: 40 },
  { id: '5', key: 'GREEN', name: 'Green', hexCode: '#15803D', sortOrder: 50 },
  { id: '6', key: 'RED', name: 'Red', hexCode: '#DC2626', sortOrder: 60 },
  { id: '7', key: 'BURGUNDY', name: 'Burgundy', hexCode: '#800020', sortOrder: 70 },
  { id: '8', key: 'GREY', name: 'Grey', hexCode: '#6B7280', sortOrder: 80 },
  { id: '9', key: 'BROWN', name: 'Brown', hexCode: '#78350F', sortOrder: 90 },
  { id: '10', key: 'CREAM', name: 'Cream', hexCode: '#FFFDD0', sortOrder: 100 },
  { id: '11', key: 'BEIGE', name: 'Beige', hexCode: '#F5F5DC', sortOrder: 110 },
  { id: '12', key: 'GOLD', name: 'Gold', hexCode: '#D97706', sortOrder: 120 },
  { id: '13', key: 'SILVER', name: 'Silver', hexCode: '#94A3B8', sortOrder: 130 },
  { id: '14', key: 'PURPLE', name: 'Purple', hexCode: '#7E22CE', sortOrder: 140 },
  { id: '15', key: 'PINK', name: 'Pink', hexCode: '#EC4899', sortOrder: 150 },
  { id: '16', key: 'YELLOW', name: 'Yellow', hexCode: '#EAB308', sortOrder: 160 },
  { id: '17', key: 'ORANGE', name: 'Orange', hexCode: '#EA580C', sortOrder: 170 },
];

export default function WardrobeCataloguePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [categories, setCategories] = useState<DynamicCategory[]>(DEFAULT_CATEGORIES);
  const [colors, setColors] = useState<DynamicColor[]>(DEFAULT_COLORS);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGender, setSelectedGender] = useState('ALL');

  // Modal State for Item CRUD
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WardrobeItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Suit');
  const [itemGender, setItemGender] = useState('UNISEX');
  const [itemNotes, setItemNotes] = useState('');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [submittingItem, setSubmittingItem] = useState(false);

  // Modal State for Variant Management
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [activeItemForVariants, setActiveItemForVariants] = useState<WardrobeItem | null>(null);
  const [variantColorName, setVariantColorName] = useState('');
  const [variantColorHex, setVariantColorHex] = useState('#0A192F');
  const [variantImage, setVariantImage] = useState<string | null>(null);
  const [variantIsDefault, setVariantIsDefault] = useState(false);
  const [submittingVariant, setSubmittingVariant] = useState(false);

  // Feedback State
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchLookups = useCallback(async () => {
    try {
      const [catsRes, colsRes] = await Promise.all([
        apiRequest<DynamicCategory[]>('/wardrobe/categories').catch(() => null),
        apiRequest<DynamicColor[]>('/wardrobe/colors').catch(() => null),
      ]);
      if (Array.isArray(catsRes) && catsRes.length > 0) {
        setCategories(catsRes);
      }
      if (Array.isArray(colsRes) && colsRes.length > 0) {
        setColors(colsRes);
      }
    } catch {
      // Keep sensible default reference lookups
    }
  }, []);

  const fetchCatalogue = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest<any>('/admin/wardrobe/items');
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(list);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load wardrobe catalogue' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogue();
    fetchLookups();
  }, [fetchCatalogue, fetchLookups]);


  // Image Upload helper using FileReader to Base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'item' | 'variant') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image file must be under 5MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (target === 'item') {
        setItemImage(result);
      } else {
        setVariantImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const openCreateItemModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory('Suit');
    setItemGender('UNISEX');
    setItemNotes('');
    setItemImage(null);
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: WardrobeItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.category);
    setItemGender(item.gender);
    setItemNotes(item.notes || '');
    setItemImage(item.imageUrl || null);
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemCategory.trim()) {
      setMessage({ type: 'error', text: 'Name and Category are required' });
      return;
    }

    try {
      setSubmittingItem(true);
      if (editingItem) {
        await apiRequest(`/admin/wardrobe/items/${editingItem.id}`, {
          method: 'PATCH',
          body: {
            name: itemName,
            category: itemCategory,
            gender: itemGender,
            notes: itemNotes,
            imageUrl: itemImage || undefined
          }
        });
        setMessage({ type: 'success', text: `Updated "${itemName}" successfully` });
      } else {
        await apiRequest('/admin/wardrobe/items', {
          method: 'POST',
          body: {
            name: itemName,
            category: itemCategory,
            gender: itemGender,
            notes: itemNotes,
            imageUrl: itemImage || undefined
          }
        });
        setMessage({ type: 'success', text: `Created "${itemName}" successfully` });
      }
      setIsItemModalOpen(false);
      fetchCatalogue();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save wardrobe item' });
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleDeleteItem = async (item: WardrobeItem) => {
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) return;

    try {
      await apiRequest(`/admin/wardrobe/items/${item.id}`, {
        method: 'DELETE'
      });
      setMessage({ type: 'success', text: `Deleted "${item.name}"` });
      fetchCatalogue();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete item' });
    }
  };

  const openVariantManager = (item: WardrobeItem) => {
    setActiveItemForVariants(item);
    setVariantColorName('');
    setVariantColorHex('#0F2C59');
    setVariantImage(null);
    setVariantIsDefault(item.variants.length === 0);
    setIsVariantModalOpen(true);
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItemForVariants) return;
    if (!variantColorName.trim()) {
      setMessage({ type: 'error', text: 'Color name is required' });
      return;
    }

    try {
      setSubmittingVariant(true);
      await apiRequest(`/admin/wardrobe/items/${activeItemForVariants.id}/variants`, {
        method: 'POST',
        body: {
          colorName: variantColorName,
          colorHex: variantColorHex,
          imageUrl: variantImage || undefined,
          isDefault: variantIsDefault
        }
      });
      setMessage({ type: 'success', text: `Added variant "${variantColorName}" to ${activeItemForVariants.name}` });
      setVariantColorName('');
      setVariantImage(null);
      setVariantIsDefault(false);
      
      // Refresh catalogue and active item
      const res = await apiRequest<any>('/admin/wardrobe/items');
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(list);
      const updated = list.find((i: any) => i.id === activeItemForVariants.id);
      if (updated) setActiveItemForVariants(updated);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to add variant' });
    } finally {
      setSubmittingVariant(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure you want to remove this color variant?')) return;
    try {
      await apiRequest(`/admin/wardrobe/variants/${variantId}`, {
        method: 'DELETE'
      });
      setMessage({ type: 'success', text: 'Removed color variant' });
      
      const res = await apiRequest<any>('/admin/wardrobe/items');
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setItems(list);
      if (activeItemForVariants) {
        const updated = list.find((i: any) => i.id === activeItemForVariants.id);
        if (updated) setActiveItemForVariants(updated);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to remove variant' });
    }
  };

  // Filter items
  const categoriesList = Array.from(new Set(items.map((i) => i.category)));
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.variants.some((v) => v.colorName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesGender = selectedGender === 'ALL' || item.gender === selectedGender;
    return matchesSearch && matchesCat && matchesGender;
  });

  return (
    <AdminLayoutShell activeHref="/admin/wardrobe/catalogue">
      <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/admin/wardrobe" className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Wardrobe Hub
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Clothing Catalogue</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Clothing Catalogue & Variants
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Manage reusable clothing entities (Suits, Gowns, Native Wear, Accessories) and their color palettes.
            Outfits reference these variants dynamically.
          </p>
        </div>

        {canCreateWardrobe(user) && (
          <div className="flex items-center gap-3">
            <button
              onClick={openCreateItemModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5" /> Add Clothing Item
            </button>
          </div>
        )}
      </div>

      {/* Notifications / Alerts */}
      {message && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs hover:underline font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-card border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, category, or color variant (e.g. Burgundy Suit, Navy Native)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3.5 py-2.5 bg-background border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Categories ({categoriesList.length})</option>
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="px-3.5 py-2.5 bg-background border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Genders</option>
              <option value="UNISEX">Unisex</option>
              <option value="MEN">Men</option>
              <option value="WOMEN">Women</option>
            </select>
          </div>
        </div>
      </div>

      {/* Catalogue Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-card border rounded-2xl p-4 h-72 animate-pulse space-y-4">
              <div className="w-full h-40 bg-muted rounded-xl" />
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-card border rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Shirt className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold">No Catalogue Items Found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || selectedCategory !== 'ALL' || selectedGender !== 'ALL'
              ? 'No items match your active search filters. Try clearing or expanding your criteria.'
              : 'Your wardrobe catalogue is empty. Start by adding reusable clothing items like Suits, Gowns, or Shirts.'}
          </p>
          {canCreateWardrobe(user) && (
            <button
              onClick={openCreateItemModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredItems.map((item) => {
            const defaultVariant = item.variants.find((v) => v.isDefault) || item.variants[0];
            const displayImage = defaultVariant?.imageUrl || item.imageUrl;

            return (
              <div
                key={item.id}
                className="group bg-card border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Card Visual / Thumbnail */}
                  <div className="relative w-full h-48 bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center overflow-hidden">
                    {displayImage ? (
                      <img
                        src={displayImage}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                        <Shirt className="w-12 h-12 stroke-[1.25]" />
                        <span className="text-xs uppercase tracking-wider font-semibold">No Image</span>
                      </div>
                    )}

                    {/* Gender badge */}
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-background/90 backdrop-blur-md text-xs font-semibold text-foreground border shadow-sm">
                      {item.gender}
                    </span>

                    {/* Category badge */}
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm">
                      {item.category}
                    </span>
                  </div>

                  {/* Item Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {item.name}
                      </h3>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.notes}</p>
                      )}
                    </div>

                    {/* Color Variants Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium flex items-center gap-1">
                          <Palette className="w-3.5 h-3.5 text-primary" /> {item.variants.length} Colors:
                        </span>
                        <button
                          onClick={() => openVariantManager(item)}
                          className="text-primary hover:underline font-semibold text-xs"
                        >
                          + Manage
                        </button>
                      </div>

                      {item.variants.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.variants.map((v) => (
                            <div
                              key={v.id}
                              title={`${v.colorName}${v.isDefault ? ' (Default)' : ''}`}
                              className="group/swatch relative flex items-center"
                            >
                              <span
                                className="w-5 h-5 rounded-full border border-black/10 shadow-inner flex items-center justify-center transition-transform hover:scale-125"
                                style={{ backgroundColor: v.colorHex || '#CBD5E1' }}
                              >
                                {v.isDefault && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400 italic">No color variants added</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 pt-3 border-t border-border/60 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between gap-2.5">
                  <button
                    onClick={() => openVariantManager(item)}
                    className="flex-1 py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <Palette className="w-3.5 h-3.5 text-primary" /> Colors ({item.variants.length})
                  </button>

                  <button
                    onClick={() => openEditItemModal(item)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
                    title="Edit Item"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteItem(item)}
                    className="p-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-all cursor-pointer border border-red-200/60 dark:border-red-900/60"
                    title="Delete Item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Create / Edit Wardrobe Item */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-xl font-bold">
                  {editingItem ? `Edit "${editingItem.name}"` : 'Add New Clothing Item'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define reusable clothing catalogue entities with category and gender tags.
                </p>
              </div>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Item Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2-Piece Suit, African Native Wear, French Cuff Shirt"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Category & Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Category *
                  </label>
                  <input
                    type="text"
                    required
                    list="categories-datalist"
                    placeholder="e.g. Suit, Gown, Tie"
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <datalist id="categories-datalist">
                    {categories.map((cat) => (
                      <option key={cat.id || cat.key} value={cat.name} />
                    ))}
                  </datalist>

                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Target Gender
                  </label>
                  <select
                    value={itemGender}
                    onChange={(e) => setItemGender(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="UNISEX">Unisex</option>
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                  </select>
                </div>
              </div>

              {/* Notes / Styling Tips */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes / Fit Guidelines
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Slim fit cut, double-breasted or single-breasted acceptable"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              {/* Image Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Base Image / Silhouette (Optional)
                </label>
                <div className="flex items-center gap-4">
                  {itemImage ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border bg-muted group">
                      <img src={itemImage} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setItemImage(null)}
                        className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed flex flex-col items-center justify-center text-muted-foreground bg-muted/40">
                      <ImageIcon className="w-6 h-6 stroke-[1.25]" />
                      <span className="text-[10px] mt-1">No Image</span>
                    </div>
                  )}

                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed hover:border-primary bg-background hover:bg-muted/40 text-xs font-medium text-foreground transition-all">
                    <Upload className="w-4 h-4 text-primary" />
                    <span>Upload Image (Auto-optimized to WebP)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleImageFileChange(e, 'item')}
                    />
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingItem}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20 disabled:opacity-50"
                >
                  {submittingItem ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Manage Color Variants */}
      {isVariantModalOpen && activeItemForVariants && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Color Variants for {activeItemForVariants.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure available shades & images (e.g. Navy, Burgundy, Emerald Green, Charcoal).
                </p>
              </div>
              <button
                onClick={() => setIsVariantModalOpen(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Variants List */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Configured Variants ({activeItemForVariants.variants.length})
              </label>

              {activeItemForVariants.variants.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                  No color variants added yet. Add your first color variant below.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                  {activeItemForVariants.variants.map((variant) => (
                    <div
                      key={variant.id}
                      className="p-3 rounded-xl border bg-muted/30 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-6 h-6 rounded-full border border-black/20 shadow-inner flex-shrink-0"
                          style={{ backgroundColor: variant.colorHex || '#CBD5E1' }}
                        />
                        <div>
                          <p className="text-xs font-bold text-foreground flex items-center gap-1">
                            {variant.colorName}
                            {variant.isDefault && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-semibold">
                                Default
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{variant.colorHex}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteVariant(variant.id)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete variant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Variant Form */}
            {canCreateWardrobe(user) && (
              <div className="p-4 rounded-2xl border bg-muted/20 space-y-4">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-primary" /> Add New Color Variant
                </h4>

                <form onSubmit={handleAddVariant} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Color Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Navy Blue, Emerald Green"
                        value={variantColorName}
                        onChange={(e) => setVariantColorName(e.target.value)}
                        className="w-full px-3 py-2 bg-background border rounded-xl text-xs focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Color Hex Swatch</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={variantColorHex}
                          onChange={(e) => setVariantColorHex(e.target.value)}
                          className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
                        />
                        <input
                          type="text"
                          value={variantColorHex}
                          onChange={(e) => setVariantColorHex(e.target.value)}
                          className="flex-1 px-3 py-2 bg-background border rounded-xl text-xs uppercase font-mono focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preset Quick Swatches */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground">Preset Color Swatches</label>
                    <div className="flex flex-wrap gap-1.5">
                      {colors.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setVariantColorName(c.name);
                            setVariantColorHex(c.hexCode);
                          }}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium bg-card hover:border-primary/50 transition-colors"
                        >
                          <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: c.hexCode }} />
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Variant Image */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Variant Image (Optional)</label>
                    {variantImage ? (
                      <div className="relative w-full h-32 rounded-xl overflow-hidden border bg-muted/30">
                        <img src={variantImage} alt="Variant Preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setVariantImage(null)}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 border-muted-foreground/20">
                        <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground font-medium">Upload Swatch / Variant Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageFileChange(e, 'variant')}
                        />
                      </label>
                    )}
                  </div>

                  {/* Default Variant Flag */}
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={variantIsDefault}
                      onChange={(e) => setVariantIsDefault(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary/20"
                    />
                    <span>Set as default primary color for {activeItemForVariants.name}</span>
                  </label>

                  {/* Add Variant Button */}
                  <button
                    type="submit"
                    disabled={submittingVariant}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" /> {submittingVariant ? 'Adding...' : 'Save Color Variant'}
                  </button>
                </form>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsVariantModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayoutShell>
  );
}
