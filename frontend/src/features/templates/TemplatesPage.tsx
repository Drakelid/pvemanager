import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useHasPermission } from '@/lib/permissions';
import OsTemplatesTab from './OsTemplatesTab';
import ImageCatalogPanel from '@/features/images/ImageCatalogPanel';

type TabValue = 'os' | 'lxc' | 'iso' | 'repositories';

export default function TemplatesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabValue>('os');
  const canManageImages = useHasPermission('template:manage');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.templates')}</h1>

      <Tabs value={tab} onValueChange={(v) => { if (v) setTab(v as TabValue); }}>
        <TabsList>
          <TabsTrigger value="os">{t('templates.tab_os')}</TabsTrigger>
          {canManageImages && <TabsTrigger value="lxc">{t('templates.tab_lxc')}</TabsTrigger>}
          {canManageImages && <TabsTrigger value="iso">{t('templates.tab_iso')}</TabsTrigger>}
          {canManageImages && <TabsTrigger value="repositories">{t('templates.tab_repositories')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="os">
          <OsTemplatesTab />
        </TabsContent>
        {canManageImages && (
          <TabsContent value="lxc">
            <ImageCatalogPanel section="lxc" />
          </TabsContent>
        )}
        {canManageImages && (
          <TabsContent value="iso">
            <ImageCatalogPanel section="iso" />
          </TabsContent>
        )}
        {canManageImages && (
          <TabsContent value="repositories">
            <ImageCatalogPanel section="repositories" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
