import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileAccessGuard } from '../files/file-access.guard';
import { RequireRole } from '../files/require-role.decorator';
import { AiDiagramService } from './ai-diagram.service';
import { GenerateDiagramDto } from './dto/generate-diagram.dto';
import { ModifyDiagramDto } from './dto/modify-diagram.dto';

@Controller('files/:fileId/ai-diagram')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class AiDiagramController {
  constructor(private readonly aiDiagramService: AiDiagramService) {}

  @Post('generate')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  generate(@CurrentLocalUserId() userId: string, @Body() dto: GenerateDiagramDto) {
    return this.aiDiagramService.generate(userId, dto.requestId, dto.prompt);
  }

  @Post('modify')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  modify(@CurrentLocalUserId() userId: string, @Body() dto: ModifyDiagramDto) {
    return this.aiDiagramService.modify(userId, dto.requestId, dto.prompt, dto.selectedElements);
  }
}
