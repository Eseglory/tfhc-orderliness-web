import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class InviteAdminDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(1, 80) firstName: string;
  @IsString() @Length(1, 80) lastName: string;
  @IsString() @Length(7, 32) phoneNumber: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true }) roleIds: string[];
}

export class UpdateAdminDto {
  @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @IsOptional() @IsString() @Length(1, 80) lastName?: string;
  @IsOptional() @IsString() @Length(7, 32) phoneNumber?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true }) roleIds?: string[];
}

export class DeactivateAdminDto {
  @IsOptional() @IsString() @Length(0, 300) reason?: string;
}
