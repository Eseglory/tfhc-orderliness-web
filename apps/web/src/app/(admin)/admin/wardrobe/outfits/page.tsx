'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Palette,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Shirt,
  Upload,
  Eye,
  Bookmark,
  ChevronRight,
  Info,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { useAuth, canCreateWardrobe } from '@/lib/auth';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';

interface Variant {
  id: string;
  colorName: string;
  colorHex?: string;
  imageUrl?: string;
}

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  gender: string;
  imageUrl?: string;
  variants: Variant[];
}

interface OutfitItemLayer {
  id?: string;
  wardrobeItemId: string;
  variantId?: string;
  sortOrder: number;
  item?: WardrobeItem;
  variant?: Variant;
}

interface WardrobeOutfit {
  id: string;
  title: string;
  description?: string;
  gender: string;
  coverImageUrl?: string;
  isTemplate: boolean;
  isActive: boolean;
  items: OutfitItemLayer[];
  _count?: {
    schedules: number;
  };
}

export default function WardrobeOutfitsPage() {
  const { user } = useAuth();
  const [outfits, setOutfits] = useState<WardrobeOutfit[]>([]);
  const [catalogue, setCatalogue] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [templateFilter, setTemplateFilter] = useState<'ALL' | 'TEMPLATE' | 'OUTFIT'>('ALL');

  // Modal State
  const [isBuilderModalOpen, setIsBuilderModalOpen] = useState(false);
  const [editingOutfit, setEditingOutfit] = useState<WardrobeOutfit | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState('UNISEX');
  const [isTemplate, setIsTemplate] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  
  // Layered builder state
  const [selectedLayers, setSelectedLayers] = useState<
    Array<{ wardrobeItemId: string; variantId?: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);

  // Preview Modal
  const [previewOutfit, setPreviewOutfit] = useState<WardrobeOutfit | null>(null);

  // Notifications
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [outfitsRes, catalogueRes] = await Promise.all([
        apiRequest<any>('/admin/wardrobe/outfits'),
        apiRequest<any>('/admin/wardrobe/items')
      ]);
      const outfitList = Array.isArray(outfitsRes?.data) ? outfitsRes.data : Array.isArray(outfitsRes) ? outfitsRes : [];
      const catList = Array.isArray(catalogueRes?.data) ? catalogueRes.data : Array.isArray(catalogueRes) ? catalogueRes : [];
      setOutfits(outfitList);
      setCatalogue(catList);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to fetch outfits and catalogue' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Image Upload for Outfit Cover
  const handleCoverImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image file must be under 5MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCoverImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const openCreateBuilder = () => {
    setEditingOutfit(null);
    setTitle('');
    setDescription('');
    setGender('UNISEX');
    setIsTemplate(false);
    setCoverImageUrl(null);
    setSelectedLayers([]);
    setIsBuilderModalOpen(true);
  };

  const openEditBuilder = (outfit: WardrobeOutfit) => {
    setEditingOutfit(outfit);
    setTitle(outfit.title);
    setDescription(outfit.description || '');
    setGender(outfit.gender);
    setIsTemplate(outfit.isTemplate);
    setCoverImageUrl(outfit.coverImageUrl || null);
    setSelectedLayers(
      outfit.items.map((i) => ({
        wardrobeItemId: i.wardrobeItemId,
        variantId: i.variantId || undefined
      }))
    );
    setIsBuilderModalOpen(true);
  };

  // Add layer to builder
  const handleAddLayerItem = (item: WardrobeItem) => {
    const defaultVariant = item.variants.find((v) => (v as any).isDefault) || item.variants[0];
    setSelectedLayers((prev) => [
      ...prev,
      {
        wardrobeItemId: item.id,
        variantId: defaultVariant?.id
      }
    ]);
  };

  const handleUpdateLayerVariant = (index: number, variantId: string) => {
    setSelectedLayers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], variantId };
      return copy;
    });
  };

  const handleRemoveLayer = (index: number) => {
    setSelectedLayers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveOutfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setMessage({ type: 'error', text: 'Outfit title is required' });
      return;
    }

    if (selectedLayers.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one clothing piece to this outfit' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        title,
        description,
        gender,
        isTemplate,
        coverImageUrl: coverImageUrl || undefined,
        items: selectedLayers.map((l, index) => ({
          wardrobeItemId: l.wardrobeItemId,
          variantId: l.variantId || undefined,
          sortOrder: index
        }))
      };

      if (editingOutfit) {
        await apiRequest(`/admin/wardrobe/outfits/${editingOutfit.id}`, {
          method: 'PATCH',
          body: payload
        });
        setMessage({ type: 'success', text: `Updated outfit "${title}"` });
      } else {
        await apiRequest('/admin/wardrobe/outfits', {
          method: 'POST',
          body: payload
        });
        setMessage({ type: 'success', text: `Created outfit "${title}"` });
      }

      setIsBuilderModalOpen(false);
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save outfit' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOutfit = async (outfit: WardrobeOutfit) => {
    if (!confirm(`Are you sure you want to delete "${outfit.title}"?`)) return;

    try {
      await apiRequest(`/admin/wardrobe/outfits/${outfit.id}`, {
        method: 'DELETE'
      });
      setMessage({ type: 'success', text: `Deleted outfit "${outfit.title}"` });
      fetchData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete outfit' });
    }
  };

  const filteredOutfits = outfits.filter((outfit) => {
    const matchesSearch =
      outfit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (outfit.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      outfit.items.some((i) => i.item?.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesGender = genderFilter === 'ALL' || outfit.gender === genderFilter;
    const matchesTemplate =
      templateFilter === 'ALL' ||
      (templateFilter === 'TEMPLATE' && outfit.isTemplate) ||
      (templateFilter === 'OUTFIT' && !outfit.isTemplate);

    return matchesSearch && matchesGender && matchesTemplate;
  });

  return (
    <AdminLayoutShell activeHref="/admin/wardrobe/outfits">
      <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/admin/wardrobe" className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Wardrobe Hub
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Outfit Builder</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Visual Outfit Builder & Templates
          </h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Compose harmonious wardrobe outfits by layering catalogue pieces and selecting specific color variants.
            Save reusable templates for quick Sunday and event scheduling.
          </p>
        </div>

        {canCreateWardrobe(user) && (
          <div className="flex items-center gap-3">
            <button
              onClick={openCreateBuilder}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-95"
            >
              <Sparkles className="w-5 h-5" /> Build New Outfit
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
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

      {/* Filter Bar */}
      <div className="bg-card border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search outfits by title, style instructions, or piece (e.g. Navy Suit, Burgundy Tie)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value as any)}
              className="px-3.5 py-2.5 bg-background border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Compositions</option>
              <option value="TEMPLATE">Reusable Templates</option>
              <option value="OUTFIT">Specific Outfits</option>
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
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

      {/* Outfits Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card border rounded-3xl p-5 h-80 animate-pulse space-y-4">
              <div className="w-full h-44 bg-muted rounded-2xl" />
              <div className="h-5 bg-muted rounded w-2/3" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredOutfits.length === 0 ? (
        <div className="bg-card border rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold">No Outfits or Templates Found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery || genderFilter !== 'ALL' || templateFilter !== 'ALL'
              ? 'No outfits match the active search criteria. Try adjusting your filters.'
              : 'You have not composed any wardrobe outfits yet. Click below to launch the visual outfit builder.'}
          </p>
          <button
            onClick={openCreateBuilder}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <Sparkles className="w-4 h-4" /> Build First Outfit
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOutfits.map((outfit) => {
            // Pick preview images
            const pieceImages = outfit.items
              .map((i) => i.variant?.imageUrl || i.item?.imageUrl)
              .filter(Boolean) as string[];

            return (
              <div
                key={outfit.id}
                className="group bg-card border rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  {/* Visual Header / Collage */}
                  <div className="relative w-full h-52 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 overflow-hidden flex items-center justify-center">
                    {outfit.coverImageUrl ? (
                      <img
                        src={outfit.coverImageUrl}
                        alt={outfit.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : pieceImages.length > 0 ? (
                      <div className="grid grid-cols-2 gap-1 w-full h-full p-1 opacity-90">
                        {pieceImages.slice(0, 4).map((img, idx) => (
                          <div key={idx} className="relative w-full h-full overflow-hidden rounded-lg bg-black/40">
                            <img src={img} alt="Piece" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-white/50">
                        <Shirt className="w-12 h-12 stroke-[1.25]" />
                        <span className="text-xs uppercase tracking-wider font-semibold">Layered Composition</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                    {/* Template / Gender Badges */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-semibold border border-white/10 shadow-sm">
                        {outfit.gender}
                      </span>
                      {outfit.isTemplate && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/90 text-amber-950 text-xs font-extrabold flex items-center gap-1 shadow-sm">
                          <Bookmark className="w-3 h-3" /> Template
                        </span>
                      )}
                    </div>

                    {/* Piece Count */}
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm">
                      {outfit.items.length} {outfit.items.length === 1 ? 'Piece' : 'Pieces'}
                    </span>

                    {/* Title in cover banner */}
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="font-extrabold text-lg text-white group-hover:text-primary-foreground transition-colors line-clamp-1 drop-shadow-md">
                        {outfit.title}
                      </h3>
                    </div>
                  </div>

                  {/* Body / Layers */}
                  <div className="p-5 space-y-4">
                    {outfit.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {outfit.description}
                      </p>
                    )}

                    {/* Visual Layer Items list */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-primary" /> Outfit Ensemble:
                      </label>
                      <div className="space-y-1.5">
                        {outfit.items.map((layer, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-muted/60 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-foreground">{layer.item?.name || 'Item'}</span>
                            </div>

                            {layer.variant ? (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-background border shadow-xs">
                                <span
                                  className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                                  style={{ backgroundColor: layer.variant.colorHex || '#CBD5E1' }}
                                />
                                <span className="text-[11px] font-medium text-foreground">
                                  {layer.variant.colorName}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">Standard</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 pt-3 border-t border-border/60 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between gap-2.5">
                  <button
                    onClick={() => setPreviewOutfit(outfit)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-black flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <Eye className="w-4 h-4 text-primary" /> Preview Outfit
                  </button>

                  <button
                    onClick={() => openEditBuilder(outfit)}
                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700/60"
                    title="Edit Outfit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteOutfit(outfit)}
                    className="p-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-all cursor-pointer border border-red-200/60 dark:border-red-900/60"
                    title="Delete Outfit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Visual Outfit Builder */}
      {isBuilderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <h3 className="text-2xl font-extrabold">
                    {editingOutfit ? `Edit Outfit "${editingOutfit.title}"` : 'Visual Outfit Builder'}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select items from the catalogue, choose specific color variants, and preview your complete ensemble.
                </p>
              </div>
              <button
                onClick={() => setIsBuilderModalOpen(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveOutfit} className="space-y-6">
              {/* Top metadata grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Outfit Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Formal Sunday Service, Royal African Native, Youth Elegance"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Gender Category
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-4 py-2.5 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 font-medium"
                  >
                    <option value="UNISEX">Unisex</option>
                    <option value="MEN">Men</option>
                    <option value="WOMEN">Women</option>
                  </select>
                </div>
              </div>

              {/* Description / Styling Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Styling Notes & Guidelines
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Navy blue two-piece suit with crisp white dress shirt and deep burgundy tie. Black dress shoes mandatory."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-background border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>

              {/* Reusable Template & Cover Image options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-muted/20 border">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Template Configuration
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={isTemplate}
                      onChange={(e) => setIsTemplate(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary/20"
                    />
                    <span>Save as reusable template (e.g. &quot;Formal Suit&quot;, &quot;Native Ensemble&quot;)</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Templates can be quickly scheduled for multiple Sundays with varying color palettes.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Custom Cover Image (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    {coverImageUrl ? (
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border">
                        <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCoverImageUrl(null)}
                          className="absolute inset-0 bg-black/60 text-white opacity-0 hover:opacity-100 flex items-center justify-center text-[10px]"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                    <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed hover:border-primary bg-background text-xs font-medium">
                      <Upload className="w-3.5 h-3.5 text-primary" />
                      <span>{coverImageUrl ? 'Change Cover Photo' : 'Upload Outfit Collage / Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCoverImageChange}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Layered Composition Section */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
                {/* Available Catalogue Items Picker (Left 5 Cols) */}
                <div className="md:col-span-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Shirt className="w-4 h-4 text-primary" /> 1. Pick Catalogue Pieces
                    </label>
                    <Link
                      href="/admin/wardrobe/catalogue"
                      target="_blank"
                      className="text-[11px] text-primary hover:underline"
                    >
                      + Add New Item
                    </Link>
                  </div>

                  <div className="p-3 bg-muted/20 border rounded-2xl space-y-2 max-h-72 overflow-y-auto">
                    {catalogue.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Catalogue is empty. Please add items in the Catalogue page first.
                      </p>
                    ) : (
                      catalogue.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-xl border bg-card hover:border-primary/50 transition-all flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-8 h-8 rounded-lg object-cover border"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                <Shirt className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-foreground">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {item.category} • {item.variants.length} colors
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddLayerItem(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-xs font-semibold flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Layered Outfit Composition & Swatches (Right 7 Cols) */}
                <div className="md:col-span-7 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-primary" /> 2. Selected Outfit Layers ({selectedLayers.length})
                    </label>
                    <span className="text-[11px] text-muted-foreground">Ordered head-to-toe</span>
                  </div>

                  <div className="p-3 bg-muted/20 border rounded-2xl space-y-2.5 min-h-[18rem] max-h-72 overflow-y-auto">
                    {selectedLayers.length === 0 ? (
                      <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed rounded-xl space-y-2 text-muted-foreground">
                        <Layers className="w-8 h-8 stroke-[1.25]" />
                        <p className="text-xs font-semibold">No clothing pieces added yet</p>
                        <p className="text-[11px] max-w-xs">
                          Click <strong>+ Add</strong> on items from the left catalogue list to compose your outfit ensemble.
                        </p>
                      </div>
                    ) : (
                      selectedLayers.map((layer, index) => {
                        const item = catalogue.find((c) => c.id === layer.wardrobeItemId);
                        if (!item) return null;

                        return (
                          <div
                            key={index}
                            className="p-3 rounded-xl border bg-card shadow-xs space-y-2 animate-in fade-in duration-200"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                  {index + 1}
                                </span>
                                <span className="text-xs font-extrabold text-foreground">{item.name}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                  {item.category}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveLayer(index)}
                                className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Variant / Color Selector */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                                <Palette className="w-3 h-3 text-primary" /> Select Color Variant:
                              </label>

                              {item.variants.length > 0 ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {item.variants.map((variant) => {
                                    const isSelected = layer.variantId === variant.id;
                                    return (
                                      <button
                                        type="button"
                                        key={variant.id}
                                        onClick={() => handleUpdateLayerVariant(index, variant.id)}
                                        className={`px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                                          isSelected
                                            ? 'bg-primary text-primary-foreground font-bold shadow-sm border-primary scale-105'
                                            : 'bg-background hover:bg-muted text-foreground'
                                        }`}
                                      >
                                        <span
                                          className="w-3 h-3 rounded-full border border-black/20"
                                          style={{ backgroundColor: variant.colorHex || '#CBD5E1' }}
                                        />
                                        <span>{variant.colorName}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                  No color variants configured for this item. Default styling applies.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsBuilderModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border font-semibold text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-7 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {submitting ? 'Saving Outfit...' : editingOutfit ? 'Update Outfit' : 'Save & Publish Outfit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visual Outfit Detail Preview */}
      {previewOutfit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold">Visual Outfit Presentation</h3>
              </div>
              <button
                onClick={() => setPreviewOutfit(null)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Cover Hero */}
            <div className="relative w-full h-56 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
              {previewOutfit.coverImageUrl ? (
                <img
                  src={previewOutfit.coverImageUrl}
                  alt={previewOutfit.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Shirt className="w-14 h-14 stroke-[1.25]" />
                  <span className="text-sm font-semibold tracking-wider uppercase">Visual Outfit Collage</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-5 right-5">
                <span className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider">
                  {previewOutfit.gender}
                </span>
                <h2 className="text-2xl font-black text-white mt-1 drop-shadow-md">{previewOutfit.title}</h2>
              </div>
            </div>

            {previewOutfit.description && (
              <div className="p-4 rounded-2xl bg-muted/40 border text-sm text-foreground leading-relaxed">
                <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Styling Notes:
                </p>
                {previewOutfit.description}
              </div>
            )}

            {/* Individual Layer Pieces with Swatches & Images */}
            <div className="space-y-3">
              <h4 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Complete Ensemble Breakdown
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {previewOutfit.items.map((layer, idx) => {
                  const pieceImage = layer.variant?.imageUrl || layer.item?.imageUrl;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl border bg-card flex items-center gap-3.5 shadow-sm"
                    >
                      {pieceImage ? (
                        <img
                          src={pieceImage}
                          alt={layer.item?.name}
                          className="w-12 h-12 rounded-xl object-cover border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                          <Shirt className="w-6 h-6 stroke-[1.5]" />
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-xs font-bold text-foreground line-clamp-1">{layer.item?.name}</p>
                        {layer.variant ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs"
                              style={{ backgroundColor: layer.variant.colorHex || '#CBD5E1' }}
                            />
                            <span className="text-xs font-medium text-foreground">{layer.variant.colorName}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">Standard item</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewOutfit(null)}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayoutShell>
  );
}
