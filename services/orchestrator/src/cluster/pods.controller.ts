import { Controller, HttpCode, Post } from '@nestjs/common';
import { ClusterService } from './cluster.service';
import { KillPodResult } from './cluster-snapshot.interface';

@Controller('pods')
export class PodsController {
  constructor(private readonly clusterService: ClusterService) {}

  @Post('kill')
  @HttpCode(200)
  matar(): Promise<KillPodResult> {
    return this.clusterService.killRandomApiPod();
  }
}
