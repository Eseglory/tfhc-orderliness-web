import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

/** Minimum password length shared by every password-setting flow. */
export const MIN_PASSWORD_LENGTH = 12;

export class LoginDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(1, 1024) password: string;
}

/**
 * Public member self-registration. Only succeeds when the email is already on
 * the ApprovedMember allowlist; no `role` is accepted — self-signups are always
 * members.
 */
export class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @Length(MIN_PASSWORD_LENGTH, 1024) password: string;
  @IsString() @Length(1, 80) firstName: string;
  @IsString() @Length(1, 80) lastName: string;
  @IsString() @Length(7, 32) phoneNumber: string;
}

export class AcceptInviteDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @Length(MIN_PASSWORD_LENGTH, 1024) password: string;
}

export class VerifyEmailDto {
  @IsString() @Length(20, 200) token: string;
}

export class EmailOnlyDto {
  @IsEmail() @MaxLength(254) email: string;
}

export class ResetPasswordDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @Length(MIN_PASSWORD_LENGTH, 1024) password: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 1024) currentPassword: string;
  @IsString() @Length(MIN_PASSWORD_LENGTH, 1024) newPassword: string;
}
