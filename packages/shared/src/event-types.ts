/**
 * Default event-type catalogue. Seeded once; a Super Admin can then add,
 * rename, reorder or deactivate types via lookup management. `isSystem` types
 * cannot be deleted (only deactivated).
 */

export interface EventTypeDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultCompulsory: boolean;
  /** Heuristic: legacy MeetingCategory names that map to this type on backfill. */
  categoryMatch?: string[];
}

export const DEFAULT_EVENT_TYPES: readonly EventTypeDef[] = [
  {
    key: 'SERVICE',
    name: 'Service',
    description: 'Regular worship services',
    icon: 'church',
    color: '#0F172A',
    defaultCompulsory: true,
    categoryMatch: ['Sunday Service', 'Midweek Service'],
  },
  {
    key: 'MEETING',
    name: 'Meeting',
    description: 'Unit, executive, committee and general meetings',
    icon: 'groups',
    color: '#2563EB',
    defaultCompulsory: true,
    categoryMatch: ['Unit Meeting', 'Executive Meeting', 'General Meeting', 'Committee Meeting'],
  },
  {
    key: 'TRAINING',
    name: 'Training',
    description: 'Leadership training, seminars and workshops',
    icon: 'school',
    color: '#7C3AED',
    defaultCompulsory: true,
    categoryMatch: ['Training', 'Seminar'],
  },
  {
    key: 'PRAYER',
    name: 'Prayer Meeting',
    description: 'Prayer meetings and vigils',
    icon: 'volunteer_activism',
    color: '#0891B2',
    defaultCompulsory: false,
  },
  {
    key: 'BIBLE_STUDY',
    name: 'Bible Study',
    description: 'Bible study and discipleship classes',
    icon: 'menu_book',
    color: '#059669',
    defaultCompulsory: false,
  },
  {
    key: 'SPECIAL_SERVICE',
    name: 'Special Service',
    description: 'Conventions, crusades and special programmes',
    icon: 'auto_awesome',
    color: '#D97706',
    defaultCompulsory: true,
    categoryMatch: ['Special Programme', 'Conference'],
  },
  {
    key: 'OUTREACH',
    name: 'Outreach',
    description: 'Evangelism and community outreach',
    icon: 'diversity_3',
    color: '#DB2777',
    defaultCompulsory: false,
  },
  {
    key: 'WEDDING',
    name: 'Wedding',
    description: 'Wedding ceremonies and receptions',
    icon: 'favorite',
    color: '#E11D48',
    defaultCompulsory: false,
  },
  {
    key: 'FUNERAL',
    name: 'Funeral',
    description: 'Funeral and memorial services',
    icon: 'local_florist',
    color: '#475569',
    defaultCompulsory: false,
  },
  {
    key: 'CELEBRATION',
    name: 'Celebration',
    description: 'Birthdays, anniversaries, parties and thanksgiving',
    icon: 'celebration',
    color: '#F59E0B',
    defaultCompulsory: false,
  },
  {
    key: 'OTHER',
    name: 'Other',
    description: 'Any other church activity',
    icon: 'event',
    color: '#64748B',
    defaultCompulsory: false,
  },
] as const;
