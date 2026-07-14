import { DeepPartial, EntityManager, Repository } from 'typeorm';

export abstract class RepositoryAdapter<T extends { id: string }> {
  protected constructor(protected readonly repository: Repository<T>) {}

  protected manager(manager?: EntityManager): EntityManager {
    return manager ?? this.repository.manager;
  }

  async findById(id: string, manager?: EntityManager): Promise<T | null> {
    return this.manager(manager).getRepository<T>(this.repository.target).findOneBy({ id } as any);
  }

  async create(data: DeepPartial<T>, manager?: EntityManager): Promise<T> {
    const repo = this.manager(manager).getRepository<T>(this.repository.target);
    const entity = repo.create(data);
    return repo.save(entity);
  }
}
