import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WardrobeService } from './wardrobe.service';

@Controller('wardrobe')
@UseGuards(JwtAuthGuard)
export class WardrobeController {
  constructor(private wardrobeService: WardrobeService) {}

  /**
   * Deterministic NEXT WARDROBE:
   * Returns the immediate next published wardrobe schedule for the member dashboard.
   */
  @Get('next')
  async getNextWardrobe() {
    return this.wardrobeService.getNextWardrobe();
  }

  /**
   * Upcoming published wardrobe schedules & timetable
   */
  @Get('upcoming')
  async getUpcomingSchedules(
    @Query('month') month?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
  ) {
    return this.wardrobeService.getUpcomingSchedules({
      month,
      limit: limit ? parseInt(limit, 10) : undefined,
      all: all === 'true' || all === '1',
    });
  }

  /**
   * View full visual outfit details and styling notes
   */
  @Get('outfits/:id')
  async getOutfitDetails(@Param('id') id: string) {
    return this.wardrobeService.getOutfitDetails(id);
  }

  /**
   * View active clothing catalogue
   */
  @Get('catalogue')
  async getCatalogue(@Query('category') category?: string) {
    return this.wardrobeService.getCatalogue(category);
  }

  /**
   * Reference data: active clothing categories
   */
  @Get('categories')
  async getCategories() {
    return this.wardrobeService.getCategories();
  }

  /**
   * Reference data: active clothing colors
   */
  @Get('colors')
  async getColors() {
    return this.wardrobeService.getColors();
  }
}

