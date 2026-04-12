import { Module } from '@nestjs/common';
import { PostSalesController } from './post-sales.controller';
import { PostSalesService } from './post-sales.service';

@Module({
  controllers: [PostSalesController],
  providers: [PostSalesService],
})
export class PostSalesModule {}
