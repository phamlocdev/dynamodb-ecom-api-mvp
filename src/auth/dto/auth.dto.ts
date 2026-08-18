import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com', description: 'Cognito username or email' })
  @IsString()
  @IsNotEmpty()
  username!: string

  @ApiProperty({ example: 'ChangeMe123!', description: 'Account password' })
  @IsString()
  @MinLength(6)
  password!: string
}

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string
}

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token — paste this into Swagger Authorize 🔒' })
  access_token!: string

  @ApiProperty({ description: 'JWT ID token' })
  id_token!: string

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  token_type!: string

  @ApiProperty({ description: 'Expires in (seconds)', example: 3600 })
  expires_in!: number
}
