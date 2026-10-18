import { Module } from '@nestjs/common';
import { PulseOAuthService } from './oauth.service';
import { PulseActionsService } from './actions.service';
import {
  PulseMetadataController,
  PulseOAuthController,
} from './connect.controller';
import { PulseMcpController } from './mcp.controller';
@Module({
  controllers: [
    PulseMetadataController,
    PulseOAuthController,
    PulseMcpController,
  ],
  providers: [PulseOAuthService, PulseActionsService],
})
export class PulseConnectModule {}
