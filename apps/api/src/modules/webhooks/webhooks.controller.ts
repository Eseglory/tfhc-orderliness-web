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
    @Headers('x-hub-signature-256') hubSignature?: string,
  ) {
    const rawSig =
      signature ||
      hubSignature ||
      (request.headers['x-webhook-signature'] as string | undefined) ||
      (request.headers['x-hub-signature-256'] as string | undefined);
    return this.webhooksService.handleInboundWebhook(event, rawSig, request.rawBody);
  }
}
