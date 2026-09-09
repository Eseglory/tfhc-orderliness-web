import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Length } from 'class-validator';

export class CreateAccessRoleDto {
  @IsString() @Length(2, 60) name: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsString({ each: true }) permissions: string[];
}

export class UpdateAccessRoleDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsString({ each: true }) permissions?: string[];
}
