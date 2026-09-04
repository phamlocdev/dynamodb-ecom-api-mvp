import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface SesConstructProps {
  // Add SES identities, configuration sets, and sending policies here when email is introduced.
}

export class SesConstruct extends Construct {
  constructor(scope: Construct, id: string, _props: SesConstructProps = {}) {
    super(scope, id)
  }

  grantSendEmail(grantee: iam.IGrantable) {
    return iam.Grant.addToPrincipal({
      grantee,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resourceArns: ['*'],
    })
  }
}
