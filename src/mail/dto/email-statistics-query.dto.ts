import { IsIn, IsOptional } from 'class-validator'

export class EmailStatisticsQueryDto {
  @IsOptional()
  @IsIn(['true'])
  emailStatistics?: 'true'
}
