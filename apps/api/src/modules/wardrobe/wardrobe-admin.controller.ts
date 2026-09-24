import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { assertWardrobeCreateAuthority } from '../../common/rbac/authorization-rules';
import { WardrobeAdminService } from './wardrobe-admin.service';
import { WardrobeService } from './wardrobe.service';
import {
  CreateWardrobeItemDto,
  UpdateWardrobeItemDto,
  CreateWardrobeVariantDto,
  UpdateWardrobeVariantDto,
  CreateWardrobeOutfitDto,
  UpdateWardrobeOutfitDto,
  CreateWardrobeScheduleDto,
  UpdateWardrobeScheduleDto,
  GenerateMonthlySundaysDto,
  CreateWardrobeCategoryDto,
  UpdateWardrobeCategoryDto,
  CreateWardrobeColorDto,
  UpdateWardrobeColorDto,
} from './wardrobe.dto';

@Controller('admin/wardrobe')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WardrobeAdminController {
  constructor(
    private adminService: WardrobeAdminService,
    private wardrobeService: WardrobeService,
  ) {}

  // ---------------------------------------------------------------------------
  // Overview / Next / Upcoming
  // ---------------------------------------------------------------------------

  @Get('next')
  @RequirePermissions('wardrobe.read')
  async getNextWardrobe() {
    return this.wardrobeService.getNextWardrobe();
  }

  @Get('upcoming')
  @RequirePermissions('wardrobe.read')
  async getUpcomingSchedules(
    @Query('month') month?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wardrobeService.getUpcomingSchedules({
      month,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Catalogue Items
  // ---------------------------------------------------------------------------

  @Get('items')
  @RequirePermissions('wardrobe.read')
  async listItems(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.adminService.listItems({
      category,
      search,
      activeOnly: activeOnly === 'true',
    });
  }

  @Get('items/:id')
  @RequirePermissions('wardrobe.read')
  async getItem(@Param('id') id: string) {
    return this.adminService.getItem(id);
  }

  @Post('items')
  @RequirePermissions('wardrobe.manage')
  async createItem(@Body() dto: CreateWardrobeItemDto, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createItem(dto);
  }

  @Put('items/:id')
  @RequirePermissions('wardrobe.manage')
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateItem(id, dto);
  }

  @Patch('items/:id')
  @RequirePermissions('wardrobe.manage')
  async patchItem(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteItem(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteItem(id);
  }

  // ---------------------------------------------------------------------------
  // Variants / Colours
  // ---------------------------------------------------------------------------

  @Post('items/:itemId/variants')
  @RequirePermissions('wardrobe.manage')
  async createVariant(
    @Param('itemId') itemId: string,
    @Body() dto: CreateWardrobeVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createVariant(itemId, dto);
  }

  @Put('variants/:id')
  @RequirePermissions('wardrobe.manage')
  async updateVariant(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateVariant(id, dto);
  }

  @Patch('variants/:id')
  @RequirePermissions('wardrobe.manage')
  async patchVariant(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeVariantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateVariant(id, dto);
  }

  @Delete('variants/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteVariant(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteVariant(id);
  }

  // ---------------------------------------------------------------------------
  // Image Upload with Sharp Optimization
  // ---------------------------------------------------------------------------

  @Post('upload-image')
  @RequirePermissions('wardrobe.manage')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 2 * 1024 * 1024 + 1, files: 1, fields: 0 },
    }),
  )
  async uploadImage(
    @UploadedFile() file: { buffer: Buffer; size: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.processAndStoreImage(file);
  }

  // ---------------------------------------------------------------------------
  // Outfits & Templates
  // ---------------------------------------------------------------------------

  @Get('outfits')
  @RequirePermissions('wardrobe.read')
  async listOutfits(
    @Query('templatesOnly') templatesOnly?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listOutfits({
      templatesOnly: templatesOnly !== undefined ? templatesOnly === 'true' : undefined,
      activeOnly: activeOnly === 'true',
      search,
    });
  }

  @Get('outfits/:id')
  @RequirePermissions('wardrobe.read')
  async getOutfit(@Param('id') id: string) {
    return this.adminService.getOutfit(id);
  }

  @Post('outfits')
  @RequirePermissions('wardrobe.manage')
  async createOutfit(
    @Body() dto: CreateWardrobeOutfitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createOutfit(dto, user.userId);
  }

  @Put('outfits/:id')
  @RequirePermissions('wardrobe.manage')
  async updateOutfit(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeOutfitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateOutfit(id, dto);
  }

  @Patch('outfits/:id')
  @RequirePermissions('wardrobe.manage')
  async patchOutfit(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeOutfitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateOutfit(id, dto);
  }

  @Delete('outfits/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteOutfit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteOutfit(id);
  }

  // ---------------------------------------------------------------------------
  // Schedules & Timetable
  // ---------------------------------------------------------------------------

  @Get('schedules')
  @RequirePermissions('wardrobe.read')
  async listSchedules(
    @Query('month') month?: string,
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.adminService.listSchedules({ month, status, eventType });
  }

  @Get('schedules/:id')
  @RequirePermissions('wardrobe.read')
  async getSchedule(@Param('id') id: string) {
    return this.adminService.getSchedule(id);
  }

  @Post('schedules')
  @RequirePermissions('wardrobe.manage')
  async createSchedule(
    @Body() dto: CreateWardrobeScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createSchedule(dto, user.userId);
  }

  @Put('schedules/:id')
  @RequirePermissions('wardrobe.manage')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateSchedule(id, dto);
  }

  @Patch('schedules/:id')
  @RequirePermissions('wardrobe.manage')
  async patchSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateSchedule(id, dto);
  }

  @Patch('schedules/:id/publish')
  @RequirePermissions('wardrobe.manage')
  async setPublishStatus(
    @Param('id') id: string,
    @Body() body: { publish: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.setPublishStatus(id, Boolean(body.publish));
  }

  @Delete('schedules/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteSchedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteSchedule(id);
  }

  @Post(['schedules/generate-monthly', 'schedules/bulk-monthly'])
  @RequirePermissions('wardrobe.manage')
  async generateMonthlySundays(
    @Body() dto: GenerateMonthlySundaysDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.generateMonthlySundays(dto, user.userId);
  }

  // ---------------------------------------------------------------------------
  // Categories Reference Data
  // ---------------------------------------------------------------------------

  @Get('categories')
  @RequirePermissions('wardrobe.read')
  async listCategories(
    @Query('activeOnly') activeOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listCategories({
      activeOnly: activeOnly === 'true',
      search,
    });
  }

  @Get('categories/:id')
  @RequirePermissions('wardrobe.read')
  async getCategory(@Param('id') id: string) {
    return this.adminService.getCategory(id);
  }

  @Post('categories')
  @RequirePermissions('wardrobe.manage')
  async createCategory(@Body() dto: CreateWardrobeCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createCategory(dto);
  }

  @Put('categories/:id')
  @RequirePermissions('wardrobe.manage')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateCategory(id, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('wardrobe.manage')
  async patchCategory(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteCategory(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteCategory(id);
  }

  // ---------------------------------------------------------------------------
  // Colors Reference Data
  // ---------------------------------------------------------------------------

  @Get('colors')
  @RequirePermissions('wardrobe.read')
  async listColors(
    @Query('activeOnly') activeOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listColors({
      activeOnly: activeOnly === 'true',
      search,
    });
  }

  @Get('colors/:id')
  @RequirePermissions('wardrobe.read')
  async getColor(@Param('id') id: string) {
    return this.adminService.getColor(id);
  }

  @Post('colors')
  @RequirePermissions('wardrobe.manage')
  async createColor(@Body() dto: CreateWardrobeColorDto, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.createColor(dto);
  }

  @Put('colors/:id')
  @RequirePermissions('wardrobe.manage')
  async updateColor(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeColorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateColor(id, dto);
  }

  @Patch('colors/:id')
  @RequirePermissions('wardrobe.manage')
  async patchColor(
    @Param('id') id: string,
    @Body() dto: UpdateWardrobeColorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.updateColor(id, dto);
  }

  @Delete('colors/:id')
  @RequirePermissions('wardrobe.manage')
  async deleteColor(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    assertWardrobeCreateAuthority(user);
    return this.adminService.deleteColor(id);
  }
}
