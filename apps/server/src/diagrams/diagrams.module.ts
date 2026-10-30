import { Module } from '@nestjs/common';
import { DiagramLibraryController } from './diagram-library.controller';
import { DiagramLibraryService } from './diagram-library.service';

@Module({
  controllers: [DiagramLibraryController],
  providers: [DiagramLibraryService],
})
export class DiagramsModule {}
