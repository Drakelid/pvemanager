import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

type Status = 'validating' | 'invalid' | 'form' | 'success';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<Status>('validating');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus('invalid');
      return;
    }
    apiClient
      .get<{ valid: boolean }>(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (active) setStatus(res.valid ? 'form' : 'invalid');
      })
      .catch(() => {
        if (active) setStatus('invalid');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('reset.passwords_mismatch', 'Passwords do not match'));
      return;
    }
    setIsLoading(true);
    try {
      await apiClient.post('/api/auth/reset-password', { token, new_password: password });
      setStatus('success');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'validating') {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {t('reset.checking_link', 'Checking the link...')}
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t('reset.invalid_title', 'Link is invalid')}</h1>
        <p className="text-sm text-text-secondary">
          {t('reset.invalid_text', 'This password reset link is invalid or has expired. Please request a new one.')}
        </p>
        <div className="flex items-center gap-4">
          <Link to="/forgot-password">
            <Button>{t('reset.request_new', 'Request a new link')}</Button>
          </Link>
          <Link to="/login" className="text-sm font-medium text-primary transition-opacity hover:opacity-80">
            {t('reset.back_to_login', 'Back to sign in')}
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t('reset.success_title', 'Password updated')}</h1>
        <p className="text-sm text-text-secondary">
          {t('reset.success_text', 'Your password has been changed. Redirecting to the sign-in page...')}
        </p>
        <Link to="/login" className="text-sm font-medium text-primary transition-opacity hover:opacity-80">
          {t('reset.go_to_login', 'Go to sign in')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('reset.set_title', 'Set a new password')}</h1>
        <p className="text-sm text-text-secondary">
          {t('reset.set_subtitle', 'Enter a new password for your account.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="new-password">{t('reset.new_password', 'New password')}</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder={t('reset.new_password_placeholder', 'Enter new password')}
              autoComplete="new-password"
              className="pr-9"
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('login.hide_password', 'Hide password') : t('login.show_password', 'Show password')}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">{t('reset.confirm_password', 'Confirm password')}</Label>
          <Input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
            placeholder={t('reset.confirm_password_placeholder', 'Repeat new password')}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('reset.saving', 'Saving...')}
              </span>
            ) : (
              t('reset.save', 'Save password')
            )}
          </Button>
          <Link to="/login" className="text-sm font-medium text-primary transition-opacity hover:opacity-80">
            {t('reset.back_to_login', 'Back to sign in')}
          </Link>
        </div>
      </form>
    </div>
  );
}
