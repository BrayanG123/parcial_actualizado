import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { HttpMlClient, ML_CLIENT } from './ml.client.js';
import { MlController } from './ml.controller.js';
import { MlRepository } from './ml.repository.js';
import { MlService } from './ml.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MlController],
  providers: [
    MlRepository,
    MlService,
    { provide: ML_CLIENT, useClass: HttpMlClient },
  ],
})
export class MlModule {}
