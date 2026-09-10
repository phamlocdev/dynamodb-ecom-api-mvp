import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty } from 'class-validator'

export class ResendEmailRecipientDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsEmail()
  recipientEmail!: string
}
