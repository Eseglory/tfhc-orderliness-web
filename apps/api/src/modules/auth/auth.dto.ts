import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Role } from '@tfhc/shared';

export class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(1, 1024) password: string;
}

export class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(12, 1024) password: string;
  @IsString() @Length(1, 80) firstName: string;
  @IsString() @Length(1, 80) lastName: string;
  @IsString() @Length(7, 32) phoneNumber: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsUUID() subTeamId?: string;
}

export class AcceptInviteDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @Length(12, 1024) password: string;
}
