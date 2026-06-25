import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t('reset.forgot_title', 'Password recovery')}</h1>
        <p className="text-sm text-text-secondary">
          {t(
            'reset.email_sent',
            'If an account with that email exists, we have sent a link to reset your password. Check your inbox.'
          )}
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('reset.back_to_login', 'Back to sign in')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('reset.forgot_title', 'Password recovery')}</h1>
        <p className="text-sm text-text-secondary">
          {t('reset.forgot_subtitle', 'Enter your account email and we will send you a reset link.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{t('reset.email', 'E-mail')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder={t('reset.email_placeholder', 'Enter your email')}
            autoComplete="email"
            autoFocus
            required
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('reset.sending', 'Sending...')}
              </span>
            ) : (
              t('reset.send_link', 'Send link')
            )}
          </Button>
          <Link
            to="/login"
            className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
          >
            {t('reset.back_to_login', 'Back to sign in')}
          </Link>
        </div>
      </form>
    </div>
  );
}
