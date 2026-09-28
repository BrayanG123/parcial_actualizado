import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  employee(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { active: true, branchId: true },
    });
  }

  async list(query: ListNotificationsQueryDto, userId: number) {
    const unread: Prisma.NotificationWhereInput = {
      branchId: query.branchId,
      reads: { none: { userId } },
    };
    const where: Prisma.NotificationWhereInput =
      query.unreadOnly === 'true' ? unread : { branchId: query.branchId };
    const [data, total, unreadCount] = await this.prisma.$transaction(
      [
        this.prisma.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            branch: { select: { id: true, name: true, city: true } },
            reservation: { select: { status: true } },
            reads: { where: { userId }, select: { readAt: true } },
          },
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({ where: unread }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      data: data.map(({ reads, reservation, ...notice }) => ({
        ...notice,
        type: 'RESERVATION_CREATED',
        title: 'Nueva reserva #' + notice.reservationId,
        message:
          notice.unitCount +
          (notice.unitCount === 1
            ? ' prenda reservada'
            : ' prendas reservadas'),
        reservationStatus: reservation.status,
        readAt: reads[0]?.readAt ?? null,
        isRead: reads.length > 0,
      })),
      unreadCount,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  unreadCount(userId: number, branchId?: number) {
    return this.prisma.notification.count({
      where: { branchId, reads: { none: { userId } } },
    });
  }

  markRead(id: number, userId: number, branchId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notification.findFirst({
        where: { id, branchId },
        select: { id: true },
      });
      if (!notice) return null;
      // INSERT ON CONFLICT DO NOTHING preserves the first readAt under concurrent
      // requests and only affects the authenticated user's read receipt.
      await tx.notificationRead.createMany({
        data: [{ notificationId: id, userId }],
        skipDuplicates: true,
      });
      const read = await tx.notificationRead.findUniqueOrThrow({
        where: { notificationId_userId: { notificationId: id, userId } },
        select: { readAt: true },
      });
      return { id, isRead: true, readAt: read.readAt };
    });
  }
}
