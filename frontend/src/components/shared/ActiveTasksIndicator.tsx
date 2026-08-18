import { useNavigate } from 'react-router';
import { ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useActiveTaskCount } from '@/hooks/use-tasks';
import { useTranslation } from 'react-i18next';

export default function ActiveTasksIndicator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useActiveTaskCount();
  const count = data?.count ?? 0;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => navigate('/tasks')}
          />
        }
      >
        <ListTodo className="h-4 w-4" />
        {count > 0 && (
          <Badge
            variant="default"
            className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-2xs"
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipContent>
        {count > 0
          ? t('tasks.active_count', { count })
          : t('tasks.no_active', 'No active tasks')}
      </TooltipContent>
    </Tooltip>
  );
}
