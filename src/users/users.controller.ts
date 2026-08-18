import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '../auth/roles.enum'
import { Roles } from '../auth/roles.decorator'
import { UsersService } from './users.service'
import { ManagedUser } from './user.types'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List Cognito users with their groups' })
  @ApiOkResponse({ description: 'Returns all Cognito users and their current roles.' })
  findAll(): Promise<ManagedUser[]> {
    return this.usersService.findAll()
  }
}
