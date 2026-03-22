# Access Control / 访问控制

## Overview

The WeChat channel plugin includes access control to prevent unauthorized users from interacting with your Claude Code instance.

## Policies

### `pairing` (default)

New users who message you receive a 6-digit pairing code. You must confirm the code in Claude Code to grant access:

```
/weixin:access pair 123456
```

Once confirmed, the user is added to the allowlist permanently.

### `allowlist`

Only pre-approved users can send messages. New users are silently ignored (no pairing codes sent). Use this after you've paired all intended users:

```
/weixin:access policy allowlist
```

### `disabled`

All users can message freely. **Not recommended** — use only for testing.

```
/weixin:access policy disabled
```

## Managing Users

```bash
# Add a user manually
/weixin:access allow <userId>

# Remove a user
/weixin:access remove <userId>

# View current status
/weixin:access status
```

## Storage

Access configuration is stored in `~/.claude/channels/weixin/access.json`:

```json
{
  "policy": "pairing",
  "allowFrom": ["user_id_1", "user_id_2"]
}
```

## Security Considerations

- Always use `pairing` or `allowlist` policy in production
- The `disabled` policy exposes your Claude Code instance to prompt injection from any WeChat user
- Pairing codes expire after 10 minutes
- User IDs are WeChat internal identifiers, not display names
