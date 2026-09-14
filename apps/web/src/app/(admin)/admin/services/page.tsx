'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Layers,
  Clock,
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Edit2,
  Power,
  Shield,
  Tag,
  DollarSign,
  Video,
  MapPin,
  Calendar,
  LayoutGrid,
  Table as TableIcon,
  Columns,
  List,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  UserCheck,
  Briefcase,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { AdminLayoutShell } from '../../../../components/admin/AdminLayoutShell';
import { fetchApi, ApiError } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Modal, ConfirmDialog, useToast } from '../../../../components/ui';

export type ServiceCategory =
  | 'ADVISORY'
  | 'CONSULTATION'
  | 'COUNSELING'
  | 'TECHNICAL'
  | 'FACILITY'
  | 'ADMINISTRATIVE'
  | 'OTHER';

export type AppointmentMode = 'IN_PERSON' | 'VIDEO_CONFERENCE' | 'PHONE_CALL';

export interface OrganizationServiceItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: ServiceCategory;
  durationMinutes: number;
  price: number;
  currency: string;
  capacity: number;
  isBookable: boolean;
  active: boolean;
  locationType: AppointmentMode;
  defaultLocation: string | null;
  instructions: string | null;
  assignedStaffIds: string[];
  createdAt: string;
  _count?: { appointments: number };
}

type ViewMode = 'grid' | 'table' | 'cards' | 'compact';

const CATEGORY_BADGES: Record<ServiceCategory, { label: string; color: string }> = {
  ADVISORY: {
    label: 'Executive Advisory',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  CONSULTATION: {
    label: 'Consultation',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  COUNSELING: {
    label: 'Member Support & Guidance',
    color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  TECHNICAL: {
    label: 'Technical Logistics',
    color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  },
  FACILITY: {
    label: 'Facility & Equipment',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  ADMINISTRATIVE: {
    label: 'Administrative',
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  OTHER: {
    label: 'General Service',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
};

export default function ServicesCatalogPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [services, setServices] = useState<OrganizationServiceItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modals
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<OrganizationServiceItem | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<OrganizationServiceItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<ServiceCategory>('CONSULTATION');
  const [formDuration, setFormDuration] = useState(30);
  const [formPrice, setFormPrice] = useState(0);
  const [formCapacity, setFormCapacity] = useState(1);
  const [formMode, setFormMode] = useState<AppointmentMode>('IN_PERSON');
  const [formLocation, setFormLocation] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formBookable, setFormBookable] = useState(true);
  const [formActive, setFormActive] = useState(true);

  // Load view mode preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tfhc_services_view_mode') as ViewMode;
      if (saved && ['grid', 'table', 'cards', 'compact'].includes(saved)) {
        setViewMode(saved);
      }
    } catch {}
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('tfhc_services_view_mode', mode);
    } catch {}
  };

  const loadServices = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{
        items: OrganizationServiceItem[];
        total: number;
        page: number;
        limit: number;
      }>('/services?limit=100');
      setServices(res.items || []);
      setTotalRecords(res.total || 0);
    } catch (e: any) {
      notify(e.message || 'Could not load organizational services catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const openCreateModal = () => {
    setEditingService(null);
    setFormName('');
    setFormDescription('');
    setFormCategory('CONSULTATION');
    setFormDuration(30);
    setFormPrice(0);
    setFormCapacity(1);
    setFormMode('IN_PERSON');
    setFormLocation('Executive Boardroom');
    setFormInstructions('');
    setFormBookable(true);
    setFormActive(true);
    setServiceModalOpen(true);
  };

  const openEditModal = (s: OrganizationServiceItem) => {
    setEditingService(s);
    setFormName(s.name);
    setFormDescription(s.description || '');
    setFormCategory(s.category);
    setFormDuration(s.durationMinutes);
    setFormPrice(s.price);
    setFormCapacity(s.capacity);
    setFormMode(s.locationType);
    setFormLocation(s.defaultLocation || '');
    setFormInstructions(s.instructions || '');
    setFormBookable(s.isBookable);
    setFormActive(s.active);
    setServiceModalOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      notify('Service title is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        durationMinutes: Number(formDuration),
        price: Number(formPrice),
        capacity: Number(formCapacity),
        locationType: formMode,
        defaultLocation: formLocation.trim() || undefined,
        instructions: formInstructions.trim() || undefined,
        isBookable: formBookable,
        active: formActive,
      };

      if (editingService) {
        await fetchApi(`/services/${editingService.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('Service offering updated successfully', 'success');
      } else {
        await fetchApi('/services', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('New service offering created successfully', 'success');
      }

      setServiceModalOpen(false);
      await loadServices();
    } catch (err: any) {
      notify(err.message || 'Failed to save service offering', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggle) return;
    try {
      await fetchApi(`/services/${confirmToggle.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !confirmToggle.active }),
      });
      notify(
        `Service ${confirmToggle.active ? 'deactivated' : 'activated'} successfully`,
        'success',
      );
      setConfirmToggle(null);
      await loadServices();
    } catch (e: any) {
      notify(e.message || 'Failed to update service status', 'error');
    }
  };

  // Filtered & Paginated list
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.description && s.description.toLowerCase().includes(search.toLowerCase())) ||
        (s.defaultLocation && s.defaultLocation.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = categoryFilter === 'ALL' || s.category === categoryFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && s.active) ||
        (statusFilter === 'INACTIVE' && !s.active);

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [services, search, categoryFilter, statusFilter]);

  const totalPages = Math.ceil(filteredServices.length / pageSize) || 1;
  const paginatedServices = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredServices.slice(start, start + pageSize);
  }, [filteredServices, page, pageSize]);

  // KPIs
  const totalOfferings = services.length;
  const activeOfferings = services.filter((s) => s.active).length;
  const totalBookings = services.reduce((acc, s) => acc + (s._count?.appointments || 0), 0);

  return (
    <AdminLayoutShell activeHref="/admin/services">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              <span>ORGANIZATION OFFERINGS</span>
              <span>•</span>
              <span>SERVICES DIRECTORY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
              Services Catalog & Offerings
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
              Configure and manage organizational services, consultative programs, advisory sessions, and bookable offerings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={loadServices}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
              title="Refresh services"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <Link
              href="/admin/appointments"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors shadow-sm"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>View Appointments</span>
            </Link>

            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Service</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Services</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalOfferings}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Configured organization offerings</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Active Offerings</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{activeOfferings}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Available for member booking</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Total Appointments</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalBookings}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Booked consultation sessions</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter Toolbar & View Switcher */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search service name, description, location..."
                className="w-full pl-9 pr-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Categories</option>
                <option value="ADVISORY">Executive Advisory</option>
                <option value="CONSULTATION">Consultation</option>
                <option value="COUNSELING">Member Guidance</option>
                <option value="TECHNICAL">Technical Logistics</option>
                <option value="FACILITY">Facility &amp; Equipment</option>
                <option value="ADMINISTRATIVE">Administrative</option>
                <option value="OTHER">Other</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>

              {/* 4 View Modes */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleViewModeChange('grid')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('table')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Data Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('cards')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Detailed Offerings View"
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleViewModeChange('compact')}
                  className={`p-1.5 rounded-lg text-xs transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Views */}
        {loading ? (
          <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Loading services catalog...</p>
          </div>
        ) : paginatedServices.length === 0 ? (
          <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">No services found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No organization services matched your search and filter criteria. Adjust your search or create a new service offering.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Service</span>
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* 1. Grid Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedServices.map((s) => {
              const catBadge = CATEGORY_BADGES[s.category] || CATEGORY_BADGES.OTHER;
              return (
                <div
                  key={s.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all hover:shadow-md flex flex-col justify-between ${
                    s.active
                      ? 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/40'
                      : 'border-rose-200/80 dark:border-rose-950/60 opacity-80'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${catBadge.color}`}>
                        {catBadge.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                          s.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {s.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">{s.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {s.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{s.durationMinutes} minutes</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        {s.locationType === 'VIDEO_CONFERENCE' ? (
                          <Video className="w-3.5 h-3.5 text-cyan-500" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        <span className="truncate">{s.defaultLocation || 'In-Person'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{s._count?.appointments || 0}</span> bookings
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/admin/appointments?serviceId=${s.id}`}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                      >
                        Book Slot
                      </Link>
                      <button
                        onClick={() => openEditModal(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Edit Service"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmToggle(s)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          s.active
                            ? 'text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            : 'text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                        title={s.active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'table' ? (
          /* 2. Data Table View */
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Service Offering</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Mode &amp; Location</th>
                    <th className="py-3 px-4">Capacity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedServices.map((s) => {
                    const catBadge = CATEGORY_BADGES[s.category] || CATEGORY_BADGES.OTHER;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          <div>{s.name}</div>
                          {s.description && (
                            <div className="text-[11px] font-normal text-slate-400 line-clamp-1">{s.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${catBadge.color}`}>
                            {catBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-600 dark:text-slate-300">
                          {s.durationMinutes} mins
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            {s.locationType === 'VIDEO_CONFERENCE' ? (
                              <Video className="w-3.5 h-3.5 text-cyan-500" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            <span className="truncate max-w-[150px]">{s.defaultLocation || 'In-Person'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {s.capacity} {s.capacity === 1 ? 'person' : 'persons'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              s.active
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {s.active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/admin/appointments?serviceId=${s.id}`}
                              className="px-2 py-1 text-[11px] font-bold rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                            >
                              Book
                            </Link>
                            <button
                              onClick={() => openEditModal(s)}
                              className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmToggle(s)}
                              className={`p-1 rounded ${s.active ? 'text-rose-400 hover:text-rose-600' : 'text-emerald-400 hover:text-emerald-600'}`}
                              title={s.active ? 'Deactivate' : 'Activate'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'cards' ? (
          /* 3. Detailed Offerings View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedServices.map((s) => {
              const catBadge = CATEGORY_BADGES[s.category] || CATEGORY_BADGES.OTHER;
              return (
                <div
                  key={s.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${catBadge.color}`}>
                        {catBadge.label}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">{s.name}</h3>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        s.active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200'
                      }`}
                    >
                      {s.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400">{s.description || 'No description provided.'}</p>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Duration:</span>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">{s.durationMinutes} Minutes</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Location:</span>
                      <p className="font-semibold text-slate-700 dark:text-slate-300 truncate">{s.defaultLocation || 'In-Person'}</p>
                    </div>
                    {s.instructions && (
                      <div className="col-span-2 pt-1 border-t border-slate-200/50 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Booking Instructions:</span>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">{s.instructions}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-400">
                      <strong>{s._count?.appointments || 0}</strong> booked appointments
                    </span>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/appointments?serviceId=${s.id}`}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                      >
                        Book Appointment
                      </Link>
                      <button
                        onClick={() => openEditModal(s)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* 4. Compact List View */
          <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            {paginatedServices.map((s) => {
              const catBadge = CATEGORY_BADGES[s.category] || CATEGORY_BADGES.OTHER;
              return (
                <div key={s.id} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded border ${catBadge.color}`}>
                      {catBadge.label}
                    </span>
                    <div className="truncate">
                      <span className="text-xs font-bold text-slate-900 dark:text-white mr-2">{s.name}</span>
                      <span className="text-[11px] text-slate-400">({s.durationMinutes}m • {s.defaultLocation || 'In-Person'})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${s.active ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950' : 'text-rose-700 bg-rose-50 dark:bg-rose-950'}`}>
                      {s.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    <Link
                      href={`/admin/appointments?serviceId=${s.id}`}
                      className="px-2 py-1 text-[10px] font-bold rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100"
                    >
                      Book
                    </Link>
                    <button
                      onClick={() => openEditModal(s)}
                      className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {filteredServices.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-xs text-slate-500">
            <div>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong>{Math.min(page * pageSize, filteredServices.length)}</strong> of{' '}
              <strong>{filteredServices.length}</strong> services
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 font-bold text-slate-900 dark:text-white">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Create / Edit Service Modal */}
        <Modal
          isOpen={serviceModalOpen}
          onClose={() => setServiceModalOpen(false)}
          title={editingService ? 'Edit Service Offering' : 'Create New Service Offering'}
        >
          <form onSubmit={handleSaveService} className="space-y-4 text-xs">
            <div>
              <label htmlFor="service-title-input" className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Service Title *</label>
              <input
                id="service-title-input"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Executive Leadership Advisory"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ServiceCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ADVISORY">Executive Advisory</option>
                  <option value="CONSULTATION">Consultation</option>
                  <option value="COUNSELING">Member Support &amp; Guidance</option>
                  <option value="TECHNICAL">Technical Logistics</option>
                  <option value="FACILITY">Facility &amp; Equipment</option>
                  <option value="ADMINISTRATIVE">Administrative</option>
                  <option value="OTHER">Other Service</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  value={formDuration}
                  onChange={(e) => setFormDuration(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Explain the purpose, scope, and objectives of this service offering..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Location Mode</label>
                <select
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as AppointmentMode)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="IN_PERSON">In-Person (Office / Suite)</option>
                  <option value="VIDEO_CONFERENCE">Online (Google Meet)</option>
                  <option value="PHONE_CALL">Phone Call</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Default Venue / Link</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Executive Boardroom"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Booking Instructions (Optional)</label>
              <input
                type="text"
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                placeholder="e.g. Please bring relevant briefing notes and documents"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formBookable}
                  onChange={(e) => setFormBookable(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-bold text-slate-700 dark:text-slate-300">Allow Online Booking</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-bold text-slate-700 dark:text-slate-300">Active Status</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingService ? 'Update Service' : 'Create Service'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Toggle Status Confirmation Dialog */}
        <ConfirmDialog
          isOpen={!!confirmToggle}
          title={confirmToggle?.active ? 'Deactivate Service Offering' : 'Activate Service Offering'}
          message={`Are you sure you want to ${
            confirmToggle?.active ? 'deactivate' : 'activate'
          } "${confirmToggle?.name}"?`}
          confirmLabel={confirmToggle?.active ? 'Deactivate' : 'Activate'}
          confirmVariant={confirmToggle?.active ? 'danger' : 'primary'}
          onConfirm={handleToggleStatus}
          onClose={() => setConfirmToggle(null)}
        />
      </div>
    </AdminLayoutShell>
  );
}
