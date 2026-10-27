import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from '../../sales/dto/sale-item.dto.js';
import { ReservationItemDto } from '../../reservations/dto/reservation-item.dto.js';

export const SYNC_TYPES = ['SALE_CASH', 'RESERVATION', 'EXCHANGE'] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

/** Operacion registrada sin conexion (contrato comun web y movil). */
export class SyncOperationDto {
  /** UUID generado por el cliente: clave de idempotencia. */
  @IsUUID('4') operationId: string;

  @IsEnum(SYNC_TYPES) type: SyncType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId: number;

  /** Fecha y hora del registro local (ISO 8601 con zona). */
  @IsISO8601({ strict: true }) createdAtLocal: string;

  /** Opcional: si viene, debe coincidir con la empresa del token. */
  @IsOptional() @Type(() => Number) @IsInt() tenantId?: number;

  /** Opcional: si viene, debe coincidir con el usuario del token. */
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;

  /** Datos del tipo de operacion; se validan segun `type`. */
  @IsObject() payload: Record<string, unknown>;

  /** SHA-256 hex del payload canonico (claves ordenadas); opcional. */
  @IsOptional() @IsString() @Length(64, 64) payloadHash?: string;
}

export class SyncBatchDto {
  /** Identificador estable del dispositivo/navegador (clientId). */
  @IsUUID('4') deviceId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}

export class SyncSaleItemDto extends SaleItemDto {
  /** Precio unitario neto usado en el dispositivo (con promocion aplicada). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice: number;
}

/** payload de SALE_CASH: venta de contado registrada offline. */
export class SaleCashPayloadDto {
  /** Turno abierto con conexion antes de quedar offline. */
  @Type(() => Number) @IsInt() @Min(1) shiftId: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clientId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncSaleItemDto)
  items: SyncSaleItemDto[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  total: number;

  @IsIn(['CASH']) paymentMethod: 'CASH';

  /** Efectivo recibido (para el ticket); no cambia el importe de la venta. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashReceived?: number;
}

/** payload de RESERVATION: reserva registrada offline por un cliente. */
export class ReservationPayloadDto {
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/)
  approximateTime: string;

  @IsOptional() @IsString() @MaxLength(500) observation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReservationItemDto)
  items: ReservationItemDto[];
}

export class SyncLogsQueryDto {
  @IsOptional()
  @IsIn(['PROCESSING', 'CONFIRMED', 'REJECTED', 'CONFLICT'])
  status?: 'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT';

  @IsOptional() @IsString() @MaxLength(60) errorCode?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class SnapshotQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) branchId?: number;
}
