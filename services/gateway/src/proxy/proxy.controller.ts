import { All, Controller, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { ProxyService } from './proxy.service';

// Removidos da resposta repassada ao cliente: o corpo é reserializado pelo
// Express, então content-length/transfer-encoding originais da api ficam
// desatualizados e travariam a resposta se reenviados como estão.
const HEADERS_DE_RESPOSTA_NAO_PROPAGADOS = new Set([
  'content-length',
  'transfer-encoding',
  'connection',
]);

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*')
  async encaminhar(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const resposta = await this.proxyService.encaminhar(req);

    res.status(resposta.status);
    for (const [nome, valor] of Object.entries(resposta.headers)) {
      if (!HEADERS_DE_RESPOSTA_NAO_PROPAGADOS.has(nome.toLowerCase()) && valor !== undefined) {
        res.setHeader(nome, valor as string | string[]);
      }
    }
    res.send(resposta.data);
  }
}
