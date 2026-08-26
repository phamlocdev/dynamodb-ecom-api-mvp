import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AuthenticatedRequest } from '../auth/auth.types'
import { Role } from '../auth/roles.enum'
import { Roles } from '../auth/roles.decorator'
import { DtoValidationPipe } from '../validation/dto-validation.pipe'
import { UpdateUserProfileDto } from './dto/update-user-profile.dto'
import { UsersService } from './users.service'
import { ManagedUser, UserProfile } from './user.types'

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

  @Get('me/profile')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ description: 'Returns the merged Cognito and application profile.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  getOwnProfile(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    return this.usersService.getOwnProfile(request.user!)
  }

  @Patch('me/profile')
  @Roles(Role.CUSTOMER, Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiOkResponse({ description: 'Returns the updated profile.' })
  @ApiBadRequestResponse({ description: 'The profile payload is invalid.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  updateOwnProfile(
    @Req() request: AuthenticatedRequest,
    @Body(new DtoValidationPipe(UpdateUserProfileDto)) dto: UpdateUserProfileDto,
  ): Promise<UserProfile> {
    return this.usersService.updateOwnProfile(request.user!, dto)
  }
}
