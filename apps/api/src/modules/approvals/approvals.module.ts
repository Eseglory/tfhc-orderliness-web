import { Global, Module } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { ApprovalWorkflowsService } from './approval-workflows.service';
import { ApprovalsController, ApprovalWorkflowsController } from './approvals.controller';

/**
 * Global so any domain module (excuses, welfare, expenses, dues) can inject
 * ApprovalsService and register a finalizer.
 */
@Global()
@Module({
  controllers: [ApprovalsController, ApprovalWorkflowsController],
  providers: [ApprovalsService, ApprovalWorkflowsService],
  exports: [ApprovalsService, ApprovalWorkflowsService],
})
export class ApprovalsModule {}
