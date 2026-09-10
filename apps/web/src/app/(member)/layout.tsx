import { ActivenessPopups } from '../../components/activeness/ActivenessPopups';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActivenessPopups />
      {children}
    </>
  );
}
