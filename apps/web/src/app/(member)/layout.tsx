import { ActivenessPopups } from '../../components/activeness/ActivenessPopups';
import { ServiceReminderModal } from '../../components/ServiceReminderModal';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-on-background flex flex-col antialiased">
      <ActivenessPopups />
      <ServiceReminderModal />
      <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col">
        {children}
      </div>
    </div>
  );
}
