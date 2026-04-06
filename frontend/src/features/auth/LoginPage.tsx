import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      navigate('/dashboard');
    } catch {
      // Error is already handled in store
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-lg">{t('login.title', 'Sign in to your account')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">{t('login.username', 'Username')}</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearError();
              }}
              placeholder={t('login.username_placeholder', 'Enter username')}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password', 'Password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder={t('login.password_placeholder', 'Enter password')}
              autoComplete="current-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('login.signing_in', 'Signing in...')}
              </span>
            ) : (
              t('login.sign_in', 'Sign in')
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
