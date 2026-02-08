import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.productsService.findAll(user);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.productsService.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: RequestUser) {
    return this.productsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.productsService.remove(id, user);
  }
}

