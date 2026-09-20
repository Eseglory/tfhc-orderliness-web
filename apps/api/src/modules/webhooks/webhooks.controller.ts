import { Request } from 'express';
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, RawBodyRequest } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookEventPayload, WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('health')
  @Public()
  async health() {
    return this.webhooksService.health();
  }

  @Post('google-calendar')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleGoogleWebhook(
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ) {
    return this.webhooksService.handleGoogleCalendarWebhook(headers, body);
  }

  @Post('inbound')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleInbound(
    @Req() request: RawBodyRequest<Request>,
    @Body() event: WebhookEventPayload,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.webhooksService.handleInboundWebhook(event, signature, request.rawBody);
  }
}
