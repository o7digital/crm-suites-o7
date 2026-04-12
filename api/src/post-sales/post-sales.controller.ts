import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { PostSalesService } from './post-sales.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { CreateProjectTaskDto } from './dto/create-project-task.dto';
import { UpdateProjectTaskDto } from './dto/update-project-task.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller('post-sales')
export class PostSalesController {
  constructor(private readonly postSalesService: PostSalesService) {}

  @Get('projects')
  listProjects(
    @CurrentUser() user: RequestUser,
    @Query() query: ListProjectsQueryDto,
  ) {
    return this.postSalesService.listProjects(user, query);
  }

  @Post('projects')
  createProject(@Body() dto: CreateProjectDto, @CurrentUser() user: RequestUser) {
    return this.postSalesService.createProject(dto, user);
  }

  @Get('projects/:id')
  findProject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.postSalesService.findProject(id, user);
  }

  @Get('projects/:id/tasks')
  findProjectTasks(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.postSalesService.findProjectTasks(id, user);
  }

  @Post('tasks')
  createTask(@Body() dto: CreateProjectTaskDto, @CurrentUser() user: RequestUser) {
    return this.postSalesService.createTask(dto, user);
  }

  @Patch('tasks/:id')
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateProjectTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postSalesService.updateTask(id, dto, user);
  }

  @Post('tasks/:id/comments')
  addTaskComment(
    @Param('id') id: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.postSalesService.addComment(id, dto, user);
  }
}
