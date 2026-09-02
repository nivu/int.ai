# Redis Persistence Setup (Bug 7 Fix)

## Problem

When Redis crashes or restarts during an active interview, all in-memory session state is lost. This violates:
- **Constraint C**: Single source of truth for session state
- **FR-025**: Candidates must be able to reconnect within 5 minutes after network disconnection

## Solution

Enable Redis persistence using both AOF (Append-Only File) and RDB (snapshot) mechanisms.

## Configuration

The `redis.conf` file in this directory enables:

1. **AOF (Append-Only File)**: Logs every write operation
   - `appendonly yes`: Enable AOF
   - `appendfsync everysec`: Fsync every second (good balance of performance and durability)

2. **RDB Snapshots**: Periodic snapshots as backup
   - Save every 15 minutes if at least 1 key changed
   - Save every 5 minutes if at least 10 keys changed
   - Save every 60 seconds if at least 10,000 keys changed

## Deployment

### Local Development

```bash
# Start Redis with custom config
redis-server backend/redis.conf
```

### Docker

```dockerfile
FROM redis:7-alpine

# Copy custom config
COPY redis.conf /usr/local/etc/redis/redis.conf

# Create directories for persistence
RUN mkdir -p /var/lib/redis /var/log/redis && \
    chown redis:redis /var/lib/redis /var/log/redis

# Start Redis with custom config
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
```

### Railway (Production)

1. Add Redis plugin to your Railway project
2. In Redis service settings, add custom start command:
   ```
   redis-server --appendonly yes --appendfsync everysec --save 900 1 --save 300 10 --save 60 10000
   ```
3. Or upload `redis.conf` to Railway and use:
   ```
   redis-server /path/to/redis.conf
   ```

## Verification

### Check AOF is enabled:
```bash
redis-cli CONFIG GET appendonly
# Should return: 1) "appendonly" 2) "yes"
```

### Check RDB save points:
```bash
redis-cli CONFIG GET save
# Should return configured save intervals
```

### Monitor persistence:
```bash
# Check last save time
redis-cli LASTSAVE

# Check AOF rewrite status
redis-cli INFO persistence
```

## Recovery

If Redis crashes:

1. **Automatic recovery**: Redis will automatically load data from AOF/RDB on restart
2. **Manual recovery**: 
   ```bash
   # Check AOF integrity
   redis-check-aof appendonly.aof
   
   # Repair if needed
   redis-check-aof --fix appendonly.aof
   ```

## Performance Impact

- **AOF everysec**: ~1-2% performance overhead (acceptable for interview sessions)
- **RDB snapshots**: Minimal impact (background process)
- **Memory**: AOF file grows over time; Redis automatically rewrites it when it gets too large

## Monitoring

Monitor these metrics in production:

```bash
# Check AOF size
redis-cli INFO persistence | grep aof_current_size

# Check last AOF rewrite time
redis-cli INFO persistence | grep aof_last_rewrite_time_sec

# Check RDB last save time
redis-cli INFO persistence | grep rdb_last_save_time
```

## Testing

Test persistence by:

1. Start an interview session
2. Kill Redis process: `redis-cli SHUTDOWN NOSAVE` (simulates crash)
3. Restart Redis: `redis-server redis.conf`
4. Verify session state is restored
5. Candidate should be able to reconnect within 5-minute window

## Backup Strategy

For production:

1. **Daily backups**: Copy RDB file to backup storage
2. **AOF backups**: Copy AOF file periodically
3. **Retention**: Keep last 7 days of backups

```bash
# Backup script example
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/lib/redis/dump.rdb /backups/dump_$DATE.rdb
cp /var/lib/redis/appendonly.aof /backups/appendonly_$DATE.aof
```

## Troubleshooting

### AOF file corrupted:
```bash
redis-check-aof --fix appendonly.aof
redis-server redis.conf
```

### RDB file corrupted:
```bash
redis-check-rdb dump.rdb
# If corrupted, delete and rely on AOF
rm dump.rdb
redis-server redis.conf
```

### High memory usage:
```bash
# Trigger AOF rewrite
redis-cli BGREWRITEAOF

# Check memory usage
redis-cli INFO memory
```

## References

- [Redis Persistence Documentation](https://redis.io/docs/management/persistence/)
- [AOF vs RDB Trade-offs](https://redis.io/docs/management/persistence/#aof-advantages)
