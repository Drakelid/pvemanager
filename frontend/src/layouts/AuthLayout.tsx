import { Outlet } from 'react-router';
import { Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuthPattern from '@/features/auth/AuthPattern';

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('ru') ? 'ru' : 'en';

  return (
    <select
      value={lang}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      aria-label="Language"
      className="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-sm text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:text-text-primary"
    >
      <option value="ru">Русский</option>
      <option value="en">English</option>
    </select>
  );
}

export default function AuthLayout() {
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-screen bg-surface-0 lg:grid-cols-[1.4fr_1fr]">
      {/* Левая декоративная панель */}
      <div className="relative hidden overflow-hidden bg-surface-1 text-primary/60 lg:block">
        <AuthPattern className="absolute inset-0 h-full w-full" />
      </div>

      {/* Правая панель с формой */}
      <div className="flex min-h-screen flex-col px-6 py-8 sm:px-12">
        {/* Логотип */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Monitor className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold">PVEmanager</span>
        </div>

        {/* Форма по центру */}
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>

        {/* Футер */}
        <div className="flex items-center gap-4 text-sm text-text-secondary">
          <LanguageSwitcher />
          <span>PVEmanager © {year}</span>
        </div>
      </div>
    </div>
  );
}
