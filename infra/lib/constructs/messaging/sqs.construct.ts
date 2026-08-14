import { Construct } from 'constructs'

export interface SqsConstructProps {
  // Add queues, DLQs, and queue policies here when async messaging is introduced.
}

export class SqsConstruct extends Construct {
  constructor(scope: Construct, id: string, _props: SqsConstructProps = {}) {
    super(scope, id)
  }
}
