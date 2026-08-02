import { AuthForm } from '@/components/auth-form';

export default function SignupPage() {
  return (
    <div className="motion-fade-rise w-full max-w-md">
      <AuthForm mode="signup" />
    </div>
  );
}
