import { Construct } from 'constructs'

export interface SesConstructProps {
  // Add SES identities, configuration sets, and sending policies here when email is introduced.
}

export class SesConstruct extends Construct {
  constructor(scope: Construct, id: string, _props: SesConstructProps = {}) {
    super(scope, id)
  }
}
