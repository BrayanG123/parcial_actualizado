import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchesRepository } from './branches.repository.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto.js';
import { UpdateBranchDto } from './dto/update-branch.dto.js';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  async create(dto: CreateBranchDto) {
    if (await this.branchesRepository.findByCityAndName(dto.city, dto.name)) {
      throw new ConflictException(
        'A branch with the same name already exists in this city',
      );
    }
    return this.branchesRepository.create(dto);
  }

  async findAll(query: ListBranchesQueryDto) {
    const result = await this.branchesRepository.findAll({
      ...query,
      active: query.active ?? true,
    });
    return {
      data: result.data,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(id: number) {
    const branch = await this.branchesRepository.findById(id);
    if (!branch) {
      throw new NotFoundException(`Branch ${id} was not found`);
    }
    return branch;
  }

  async update(id: number, dto: UpdateBranchDto) {
    const current = await this.findOne(id);
    const city = dto.city ?? current.city;
    const name = dto.name ?? current.name;
    const duplicate = await this.branchesRepository.findByCityAndName(
      city,
      name,
    );
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException(
        'A branch with the same name already exists in this city',
      );
    }
    return this.branchesRepository.update(id, dto);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    if (await this.branchesRepository.hasOpenReservations(id)) {
      throw new ConflictException(
        'The branch cannot be deactivated while it has open reservations',
      );
    }
    return this.branchesRepository.deactivate(id);
  }
}
