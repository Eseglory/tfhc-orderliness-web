import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, ValidateNested, IsInt, Min, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWardrobeItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  category: string; // e.g. "SUIT", "BLAZER", "SHIRT", "TROUSER", "SKIRT", "GOWN", "NATIVE", "AGBADA", "KAFTAN", "TIE", "SCARF", "SHOES", "ACCESSORY", "CAP"

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  gender?: string; // "ALL", "MALE", "FEMALE"

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateWardrobeItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class CreateWardrobeVariantDto {
  @IsString()
  @IsNotEmpty()
  colorName: string; // e.g. "Navy Blue", "Black", "Burgundy", "Emerald Green", "White"

  @IsString()
  @IsOptional()
  colorCode?: string; // e.g. "#1B2A4A", "#000000", "#800020"

  @IsString()
  @IsOptional()
  colorHex?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class UpdateWardrobeVariantDto {
  @IsString()
  @IsOptional()
  colorName?: string;

  @IsString()
  @IsOptional()
  colorCode?: string;

  @IsString()
  @IsOptional()
  colorHex?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class OutfitItemComponentDto {
  @IsString()
  @IsOptional()
  itemId?: string;

  @IsString()
  @IsOptional()
  wardrobeItemId?: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsInt()
  @IsOptional()
  layerOrder?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateWardrobeOutfitDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  genderTarget?: string; // "ALL", "BROTHERS", "SISTERS"

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isTemplate?: boolean;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutfitItemComponentDto)
  @IsOptional()
  items?: OutfitItemComponentDto[];
}

export class UpdateWardrobeOutfitDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  genderTarget?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isTemplate?: boolean;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutfitItemComponentDto)
  @IsOptional()
  items?: OutfitItemComponentDto[];
}

export class CreateWardrobeScheduleDto {
  @IsString()
  @IsNotEmpty()
  outfitId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  meetingId?: string;

  @IsString()
  @IsOptional()
  serviceScheduleId?: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  eventType?: string; // "SUNDAY_SERVICE", "SPECIAL_PROGRAM", "MIDWEEK", "CONVENTION", "COMMUNION", etc.

  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateWardrobeScheduleDto {
  @IsString()
  @IsOptional()
  outfitId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  meetingId?: string;

  @IsString()
  @IsOptional()
  serviceScheduleId?: string;

  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class GenerateMonthlySundaysDto {
  @IsInt()
  @Min(2024)
  year: number;

  @IsInt()
  @Min(1)
  month: number; // 1-12

  @IsString()
  @IsOptional()
  defaultOutfitId?: string;

  @IsString()
  @IsOptional()
  outfitId?: string;

  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED'])
  @IsOptional()
  initialStatus?: string;

  @IsString()
  @IsIn(['DRAFT', 'PUBLISHED'])
  @IsOptional()
  status?: string;
}

export class CreateWardrobeCategoryDto {
  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateWardrobeCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateWardrobeColorDto {
  @IsString()
  @IsOptional()
  key?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  hexCode: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateWardrobeColorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  hexCode?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

