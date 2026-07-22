import { QueryClient } from '@tanstack/react-query';

/**
 * Единый экземпляр QueryClient приложения.
 *
 * Вынесен из App.tsx в отдельный модуль, чтобы к нему можно было обращаться вне
 * React-дерева — в частности, из auth-store для сброса кэша при смене пользователя.
 * Без сброса React Query отдавал бы закэшированные данные предыдущего пользователя
 * (список инстансов и т.п.) до жёсткой перезагрузки страницы.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
