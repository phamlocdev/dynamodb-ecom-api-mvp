import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'
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
import { EmailStatisticsQueryDto } from '../mail/dto/email-statistics-query.dto'
import { ResendEmailRecipientDto } from '../mail/dto/resend-email-recipient.dto'
import { EmailDeliveryStatistics } from '../mail/mail.types'
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
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query(new DtoValidationPipe(EmailStatisticsQueryDto)) query: EmailStatisticsQueryDto,
  ): Promise<ManagedUser[] | EmailDeliveryStatistics> {
    if (query.emailStatistics === 'true') {
      if (!request.user?.groups.includes(Role.ADMIN)) {
        throw new ForbiddenException('You do not have permission to view email statistics.')
      }
      return this.usersService.getWelcomeEmailStatistics()
    }

    return this.usersService.findAll()
  }

  @Get('email-statistics')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get welcome email delivery statistics' })
  @ApiOkResponse({ description: 'Returns counts by welcome email delivery status.' })
  getWelcomeEmailStatistics() {
    return this.usersService.getWelcomeEmailStatistics()
  }

  @Get(':userId/email-tracking')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get welcome email tracking attempts for one user' })
  @ApiOkResponse({ description: 'Returns welcome email tracking attempts.' })
  getWelcomeEmailTracking(@Param('userId') userId: string) {
    return this.usersService.getWelcomeEmailTracking(userId)
  }

  @Post(':userId/emails/welcome-new-customer/resend-failed')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend retryable failed welcome email to one recipient' })
  @ApiOkResponse({ description: 'Returns resend result for one retryable recipient.' })
  resendFailedWelcomeEmail(
    @Param('userId') userId: string,
    @Body(new DtoValidationPipe(ResendEmailRecipientDto)) dto: ResendEmailRecipientDto,
  ) {
    return this.usersService.resendFailedWelcomeEmail(userId, dto.recipientEmail)
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
