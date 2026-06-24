import { useAdminSecurity } from '@/features/server/admin/hooks';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Group,
  Input,
  LoadingCard
} from '@sharkord/ui';
import { memo } from 'react';

const formatDate = (value: number | null) =>
  value ? new Date(value).toLocaleString() : 'Never';

const Security = memo(() => {
  const {
    allowed,
    blocked,
    events,
    loading,
    ipRange,
    reason,
    setIpRange,
    setReason,
    addAllowlist,
    addBlock,
    onUnblockIp,
    onRemoveRule,
    refetch
  } = useAdminSecurity();

  if (loading) return <LoadingCard className="h-[600px]" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>
          Manage trusted / allowlisted IPs, active blocks, and recent security events.
          Docker/NPM ranges may use CIDR or wildcard syntax like 172.16.0.%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
          <Group label="IP / CIDR / wildcard">
            <Input
              value={ipRange}
              onChange={(event) => setIpRange(event.target.value)}
              placeholder="172.16.0.%"
            />
          </Group>
          <Group label="Reason">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Office network / abuse"
            />
          </Group>
          <div className="flex items-end">
            <Button onClick={addAllowlist} disabled={!ipRange.trim()}>
              Allowlist
            </Button>
          </div>
          <div className="flex items-end">
            <Button variant="destructive" onClick={addBlock} disabled={!ipRange.trim()}>
              Block
            </Button>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={refetch}>
              Refresh
            </Button>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Trusted / allowlisted IPs</h3>
          <div className="divide-y rounded-md border">
            {allowed.length ? (
              allowed.map((rule) => (
                <div key={rule.id} className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <span className="font-mono text-sm">{rule.ipRange}</span>
                  <span className="text-sm text-muted-foreground">{rule.reason || 'No reason'}</span>
                  <span className="text-sm text-muted-foreground">Expires: {formatDate(rule.expiresAt)}</span>
                  <Button variant="outline" onClick={() => onRemoveRule(rule.id)}>
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No allowlisted IPs.</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Blocked IPs</h3>
          <div className="divide-y rounded-md border">
            {blocked.length ? (
              blocked.map((rule) => (
                <div key={rule.id} className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                  <span className="font-mono text-sm">{rule.ipRange}</span>
                  <span className="text-sm text-muted-foreground">{rule.reason || 'No reason'}</span>
                  <span className="text-sm text-muted-foreground">Expires: {formatDate(rule.expiresAt)}</span>
                  <Button variant="outline" onClick={() => onUnblockIp(rule.ipRange)}>
                    Unblock
                  </Button>
                  <Button variant="outline" onClick={() => onRemoveRule(rule.id)}>
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No blocked IPs.</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Recent security events</h3>
          <div className="divide-y rounded-md border">
            {events.length ? (
              events.map((event) => (
                <div key={event.id} className="grid gap-3 p-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
                  <span className="font-mono text-sm">{event.ip}</span>
                  <span className="text-sm">{event.event}</span>
                  <span className="text-sm text-muted-foreground">{event.identity || 'anonymous'}</span>
                  <span className="text-sm text-muted-foreground">{formatDate(event.createdAt)}</span>
                </div>
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No security events.</p>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
});

export { Security };
