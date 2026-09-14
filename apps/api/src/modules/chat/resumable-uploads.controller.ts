import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CHUNK_SIZE, ResumableUploadsService } from './resumable-uploads.service';
@Controller('chat/uploads') @UseGuards(JwtAuthGuard)
export class ResumableUploadsController {
  constructor(private uploads: ResumableUploadsService) {}
  @Post() begin(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.uploads.begin(user, body); }
  @Get(':id') status(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.uploads.status(id, user); }
  @Post(':id/chunks') @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: CHUNK_SIZE, files: 1, fields: 1 } }))
  chunk(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: { offset: string }, @UploadedFile() file?: { buffer: Buffer }) {
    return this.uploads.chunk(id, user, Number(body?.offset), file?.buffer);
  }
  @Post(':id/complete') complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.uploads.complete(id, user); }
  @Delete(':id') cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.uploads.cancel(id, user); }
}
