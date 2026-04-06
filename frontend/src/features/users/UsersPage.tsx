import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Shield, Trash2, RotateCcw, Unlock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useUsers, useCreateUser, useDeleteUser,
  useResetPassword, useUnlockUser,
  useRoles, useCreateRole, useDeleteRole,
  useSessions, useTerminateSession,
} from '@/hooks/use-users';

export default function UsersPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.users')}</h1>
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('users.users')}</TabsTrigger>
          <TabsTrigger value="roles">{t('users.roles')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('users.sessions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetPassword();
  const unlockUser = useUnlockUser();

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.username?.toLowerCase().includes(s) || u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const handleCreate = () => {
    createUser.mutate({ username, password, full_name: displayName, email }, {
      onSuccess: () => { setOpen(false); setUsername(''); setPassword(''); setDisplayName(''); setEmail(''); setRole('user'); },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" />}><Plus className="h-4 w-4 mr-1" />{t('users.create')}</DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('users.create')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{t('settings.username')}</Label><Input value={username} onChange={e => setUsername(e.target.value)} className="mt-1" /></div>
                <div><Label>{t('settings.new_password')}</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1" /></div>
                <div><Label>{t('settings.display_name')}</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" /></div>
                <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
                <div>
                  <Label>{t('users.role')}</Label>
                  <Select value={role} onValueChange={v => { if (v !== null) setRole(v); }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roles.map(r => <SelectItem key={r.id ?? r.name} value={r.name}>{r.name}</SelectItem>)}
                      {roles.length === 0 && <>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="user">user</SelectItem>
                      </>}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
                <Button onClick={handleCreate}>{t('common.create')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.username')}</TableHead>
              <TableHead>{t('settings.display_name')}</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('users.last_login')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.full_name || '—'}</TableCell>
                <TableCell className="text-xs">{u.email || '—'}</TableCell>
                <TableCell><Badge variant="outline">{u.role_name || '—'}</Badge></TableCell>
                <TableCell>
                  <Badge variant={u.is_locked ? 'destructive' : u.is_active !== false ? 'default' : 'secondary'}>
                    {u.is_locked ? t('users.locked') : u.is_active !== false ? t('users.active') : t('users.inactive')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={t('users.reset_password')} onClick={() => resetPassword.mutate(u.id)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    {u.is_locked && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t('users.unlock')} onClick={() => unlockUser.mutate(u.id)}>
                        <Unlock className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteUser.mutate(u.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RolesTab() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const { data: roles = [] } = useRoles();
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{t('users.roles')}</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" />}><Plus className="h-4 w-4 mr-1" />{t('users.create_role')}</DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('users.create_role')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{t('common.name')}</Label><Input value={roleName} onChange={e => setRoleName(e.target.value)} className="mt-1" /></div>
                <div><Label>{t('ipam.description')}</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1" /></div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>{t('common.cancel')}</DialogClose>
                <Button onClick={() => { createRole.mutate({ name: roleName, display_name: roleName, description, permissions: [] }); setOpen(false); setRoleName(''); setDescription(''); }}>{t('common.create')}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('ipam.description')}</TableHead>
              <TableHead>{t('users.permissions_count')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(r => (
              <TableRow key={r.id ?? r.name}>
                <TableCell className="font-medium"><div className="flex items-center gap-2"><Shield className="h-4 w-4" />{r.name}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.description || '—'}</TableCell>
                <TableCell>{r.permissions?.length ?? '—'}</TableCell>
                <TableCell>
                  {!r.is_system && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRole.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SessionsTab() {
  const { t } = useTranslation();
  const { data: sessions = [] } = useSessions();
  const terminateSession = useTerminateSession();

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{t('users.active_sessions')}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.username')}</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>{t('users.user_agent')}</TableHead>
              <TableHead>{t('users.created')}</TableHead>
              <TableHead>{t('users.expires')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map(s => (
              <TableRow key={s.id ?? s.session_id}>
                <TableCell className="font-medium">{s.username}</TableCell>
                <TableCell className="font-mono text-xs">{s.ip_address || '—'}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate">{s.user_agent || '—'}</TableCell>
                <TableCell className="text-xs">{s.created_at ? new Date(s.created_at).toLocaleString() : '—'}</TableCell>
                <TableCell className="text-xs">{s.expires_at ? new Date(s.expires_at).toLocaleString() : '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => terminateSession.mutate(s.id ?? s.session_id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sessions.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t('common.no_data')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
