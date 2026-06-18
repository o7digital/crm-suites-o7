import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async register(data: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const now = new Date();
    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.tenantName,
        crmDisplayCurrency: 'MXN',
        users: {
          create: {
            email: data.email,
            name: data.name,
            password: await this.hashPassword(data.password),
            firstLoginAt: now,
            lastLoginAt: now,
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    const token = this.signUser(user.id, user.tenantId, user.email);
    return { token, user: this.exposeUser(user) };
  }

  async login(data: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstLoginAt: user.firstLoginAt || now,
        lastLoginAt: now,
      },
    });

    const token = this.signUser(updated.id, updated.tenantId, updated.email);
    return { token, user: this.exposeUser(updated) };
  }

  private signUser(userId: string, tenantId: string, email: string) {
    return this.jwtService.sign({ sub: userId, tenantId, email });
  }

  private async hashPassword(raw: string) {
    const saltRounds = 10;
    return bcrypt.hash(raw, saltRounds);
  }

  private exposeUser(user: { id: string; email: string; name: string; tenantId: string }) {
    const { id, email, name, tenantId } = user;
    return { id, email, name, tenantId };
  }
}
