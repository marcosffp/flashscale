import { Module } from '@nestjs/common';
import { ClusterModule } from './cluster/cluster.module';

@Module({
  imports: [ClusterModule],
})
export class AppModule {}
