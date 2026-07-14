import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isVerified: true,
        isAdmin: true,
        fraudScore: true,
        company: true,
        jobTitle: true,
        city: true,
        birthday: true,
        gender: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.city !== undefined && dto.city.trim() && dto.city.trim().length < 2) {
      throw new BadRequestException('City must be at least 2 characters.');
    }
    if (dto.birthday) {
      const birthday = new Date(`${dto.birthday}T00:00:00.000Z`);
      const earliest = new Date(); earliest.setUTCFullYear(earliest.getUTCFullYear() - 120);
      if (!Number.isFinite(birthday.getTime()) || birthday > new Date() || birthday < earliest) {
        throw new BadRequestException('Birthday must be a valid past date within the last 120 years.');
      }
    }
    const data: Record<string, string | null | undefined> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.company !== undefined) data.company = dto.company || null;
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle || null;
    if (dto.city !== undefined) data.city = dto.city.trim() || null;
    if (dto.birthday !== undefined) data.birthday = dto.birthday ? new Date(`${dto.birthday}T00:00:00.000Z`) as any : null;
    if (dto.gender !== undefined) data.gender = dto.gender || null;

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        company: true,
        jobTitle: true,
        city: true,
        birthday: true,
        gender: true,
        isVerified: true,
        isAdmin: true,
      },
    });
  }
}
