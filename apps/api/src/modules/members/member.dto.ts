import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { MemberStatus } from '@tfhc/shared';

export class UpdateMemberDto {
  @IsOptional() @IsString() @MaxLength(80) middleName?: string;
  @IsOptional() @IsString() @MaxLength(80) preferredName?: string;
  @IsOptional() @IsString() @MaxLength(32) alternatePhoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(120) profession?: string;
  @IsOptional() @IsString() @MaxLength(5) birthday?: string;
  @IsOptional() @IsString() @MaxLength(10) dateOfBirth?: string;
  @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @IsOptional() @IsString() @Length(1, 80) lastName?: string;
  @IsOptional() @IsString() @Length(7, 32) phoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) gender?: string;
  @IsOptional() @IsUUID() subTeamId?: string;
  @IsOptional() @IsString() @MaxLength(80) roleInUnit?: string;
  @IsOptional() @IsEnum(MemberStatus) status?: MemberStatus;
}

export class CreateMemberDto {
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) gender?: string;
  @IsOptional() @IsUUID() subTeamId?: string;
  @IsOptional() @IsString() @MaxLength(80) roleInUnit?: string;
  @IsOptional() @IsEnum(MemberStatus) status?: MemberStatus;
  @IsString() @Length(1, 80) firstName: string;
  @IsString() @Length(1, 80) lastName: string;
  @IsString() @Length(7, 32) phoneNumber: string;
}

export class GoogleAccessDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsEnum({ ACTIVE: "ACTIVE", REVOKED: "REVOKED" }) status: "ACTIVE" | "REVOKED";
}
