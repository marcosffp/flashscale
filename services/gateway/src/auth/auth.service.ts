import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { LoginResponseDto } from './dto/login-response.dto';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  login(nome: string): LoginResponseDto {
    const payload: JwtPayload = { sub: nome, id: randomUUID() };
    const accessToken = this.jwtService.sign(payload);
    return new LoginResponseDto(accessToken);
  }
}
